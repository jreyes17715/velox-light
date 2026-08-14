import { sapGet } from '../utils/sapClient';
import { logger } from '../utils/logger';

export interface SapBusinessPartner {
  CardCode: string;
  CardName: string;
  EmailAddress?: string;
  GroupCode?: number;       // código numérico del grupo (liga a BusinessPartnerGroups)
  U_Tipo?: string | null;   // 'D' = Directora, null/vacío = Consultora
  U_CodIni?: string | null; // CardCode de quien reclutó a esta persona (Iniciadora)
  U_NomIni?: string | null; // Nombre de la iniciadora o unidad
  U_DIQ?: string | null;    // 'S' = está en proceso DIQ
  // Fechas OFICIALES del programa DEC/DIQ, confirmadas 11-ago-2026 via Postman
  // (caso Rosa Hilda Hidalgo Urbaez, H00337: U_FechaIniD=2026-06-01,
  // U_FechaFinD=2026-08-31). El sistema calculaba su propia ventana de 3 meses
  // desde la fecha de deteccion del sync, lo cual NO coincidia con el trimestre
  // real que el negocio ya trackea en SAP -- ahora se usa SAP como fuente de
  // verdad cuando estas fechas vienen pobladas.
  U_FechaIniD?: string | null;
  U_FechaFinD?: string | null;
  // Estado de aprobacion del registro (confirmado 11-ago-2026, campo indicado
  // por Padrino tras ver duplicados de la misma persona con distintos CardCode:
  // SAP asigna un CardCode temporal tipo "CA-<timestamp>" al momento de
  // registrarse desde WordPress, y luego un CardCode definitivo (ej. C01318)
  // cuando el registro es aprobado. Sin filtro, cada CardCode entra como un
  // usuario distinto -- caso real: Yolanda Carolina Castillo Germán con 3
  // registros (2 temporales + 1 definitivo). Valor confirmado en un registro
  // ya aprobado: "Aprobado". Se usa como filtro exclusivo (si viene poblado
  // Y no es "Aprobado", se salta) -- si viene null/vacío se deja pasar, para
  // no excluir por error registros viejos que nunca tuvieron este campo.
  U_estado_consultora?: string | null;
  // Campo que IT actualiza al ascender/degradar a alguien (confirmado 28-jul-2026
  // via Postman: "Directora" | "Consultora"). Mas confiable que U_Tipo, que a
  // veces se queda sin actualizar en un ascenso -- ver caso Sarah Massiel Feliz
  // Acosta (SF-00001): U_nivel_cliente="Directora" pero U_Tipo=null y sin grupo
  // SAP asignado todavia.
  U_nivel_cliente?: string | null;
}

export interface SapBusinessPartnerGroup {
  Code: number;        // mismo valor que BusinessPartner.GroupCode
  Name: string;        // nombre del grupo, e.g. "Mujeres de Valor"
  U_CardCode?: string; // CardCode de la directora de este grupo
  U_CardName?: string; // Nombre de la directora
}

export interface SapOrderLine {
  ItemCode: string;
  LineTotal: number;
  DiscountPercent: number; // ya NO se usa para clasificar produccion, solo informativo
}

export interface SapOrder {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  DocDate: string;        // "2024-12-15"
  DocTotal: number;
  DocumentStatus: string; // 'O' = Open, 'C' = Closed
  Cancelled: string;      // 'Y' | 'N'
  DocumentLines?: SapOrderLine[];
}

interface SapListResponse<T> {
  value: T[];
  // OData server-driven paging: SAP Service Layer puede truncar cada pagina a
  // MENOS de lo pedido en $top (confirmado 10-ago-2026: pedimos $top=500 en
  // /Items y SAP devolvio solo 20, con este campo apuntando al resto). Antes
  // el codigo asumia "recibi menos de PAGE_SIZE => ya no hay mas paginas", lo
  // cual es FALSO cuando SAP trunca por su cuenta -- eso hacia que fetchSection1ItemCodes
  // (y las demas funciones paginadas) se detuvieran tras la primera pagina,
  // perdiendo silenciosamente el resto del catalogo. Caso real: item 10217391
  // (TimeWise Antioxidant Moisturizer) nunca entraba al Set de Seccion 1 pese a
  // tener Properties1='tYES', porque quedaba en la pagina 2+ que nunca se pedia.
  //
  // SEGUNDO BUG confirmado 11-ago-2026 (caso Haydee Leticia Rodriguez Ogando,
  // R01316): a veces SAP hace lo OPUESTO -- entrega una pagina COMPLETA (exactos
  // los 500 pedidos en $top) pero sin mandar este campo, como si esos 500 fueran
  // todo el universo, cuando en realidad hay muchos mas (confirmado con Postman
  // que el catalogo real supera largamente los 500). Por eso la condicion de
  // parada NO puede confiar unicamente en la ausencia de este campo: tambien hay
  // que seguir pidiendo mientras la pagina venga completa (items.length === el
  // $top pedido), y solo parar de verdad cuando llega una pagina mas chica que
  // lo pedido (o vacia). Ver helper esPaginaFinal() abajo.
  '@odata.nextLink'?: string;
}

// Señal combinada de "esta es la ultima pagina real": no hay @odata.nextLink Y
// la pagina vino mas chica que lo pedido (o vacia). Si vino nextLink O la
// pagina vino exactamente del tamaño pedido, puede haber mas -- hay que seguir.
// Ver comentario en SapListResponse para el porque de las dos condiciones.
function esPaginaFinal(data: SapListResponse<unknown>, items: unknown[], topPedido: number): boolean {
  if (items.length === 0) return true;
  const hayNextLink = !!data['@odata.nextLink'];
  const paginaCompleta = items.length >= topPedido;
  return !hayNextLink && !paginaCompleta;
}

const PAGE_SIZE = 500;
// Orders trae las líneas de detalle (DocumentLines) embebidas, lo que infla mucho
// el tamaño de cada página. Un $top más chico reduce el riesgo de ECONNRESET.
const ORDERS_PAGE_SIZE = 50;

// ─── BusinessPartners ────────────────────────────────────────────────────────

export async function fetchAllBusinessPartners(): Promise<SapBusinessPartner[]> {
  const all: SapBusinessPartner[] = [];
  let skip = 0;
  let pagina = 0;

  while (true) {
    pagina++;
    const data = await sapGet<SapListResponse<SapBusinessPartner>>('/BusinessPartners', {
      $select: 'CardCode,CardName,EmailAddress,GroupCode,U_Tipo,U_CodIni,U_NomIni,U_DIQ,U_nivel_cliente,U_FechaIniD,U_FechaFinD,U_estado_consultora',
      $filter: "CardType eq 'cCustomer'",
      // $orderby explicito -- sin esto, SAP no garantiza orden estable entre
      // paginas y la paginacion por $skip puede saltarse registros si hay
      // actividad de escritura entre una pagina y otra (bug confirmado 10-ago-2026
      // en fetchSection1ItemCodes, ver ese comentario para el caso real).
      $orderby: 'CardCode',
      $top: String(PAGE_SIZE),
      $skip: String(skip),
    });

    const items = data.value || [];
    all.push(...items);

    // TEMPORAL (11-ago-2026): log a nivel info -- el debug no se ve en Railway
    // (logger.debug solo imprime si NODE_ENV !== 'production'). Se usa para
    // depurar el caso donde el sync se detenia justo en 500 registros (caso
    // Haydee Leticia Rodriguez Ogando, R01316, confirmado via Postman que el
    // total real es bastante mayor a 500). Quitar o volver a debug una vez
    // resuelto.
    logger.info(`SAP: BusinessPartners pagina ${pagina} -- skip=${skip} recibidos=${items.length} nextLink=${data['@odata.nextLink'] ? 'SI' : 'NO'} acumulado=${all.length}`);

    if (esPaginaFinal(data, items, PAGE_SIZE)) break;
    skip += items.length;
  }

  logger.info(`SAP: ${all.length} BusinessPartners obtenidos en ${pagina} paginas`);
  return all;
}

// ─── BusinessPartnerGroups ───────────────────────────────────────────────────
// Cada grupo tiene U_CardCode = CardCode de la directora responsable

export async function fetchBusinessPartnerGroups(): Promise<SapBusinessPartnerGroup[]> {
  const all: SapBusinessPartnerGroup[] = [];
  let skip = 0;

  while (true) {
    logger.debug(`SAP: BusinessPartnerGroups skip=${skip}`);
    const data = await sapGet<SapListResponse<SapBusinessPartnerGroup>>('/BusinessPartnerGroups', {
      $select: 'Code,Name,U_CardCode,U_CardName',
      $filter: "Type eq 'bbpgt_CustomerGroup'",
      $orderby: 'Code', // ver comentario en fetchAllBusinessPartners sobre paginacion estable
      $top: String(PAGE_SIZE),
      $skip: String(skip),
    });

    const items = data.value || [];
    all.push(...items);

    // Ver comentario en SapListResponse/esPaginaFinal -- no basta con @odata.nextLink.
    if (esPaginaFinal(data, items, PAGE_SIZE)) break;
    skip += items.length;
  }

  logger.info(`SAP: ${all.length} grupos obtenidos`);
  return all;
}

// ─── Items (clasificacion Seccion 1 / Seccion 2) ──────────────────────────────
// Confirmado con el contacto de SAP: la tabla OITM tiene los campos QryGroup1 y
// QryGroup2. QryGroup1 = 'Y' significa que el articulo es "Seccion 1" (producto
// que cuenta para produccion/comisiones). El Service Layer expone QryGroup1 como
// "Properties1" en el JSON de /Items (QryGroup2 -> Properties2, etc).
//
// Devuelve un Set con los ItemCode que son Seccion 1 (Properties1 = 'tYES').
//
// IMPORTANTE -- $orderby explicito: sin esto, SAP Service Layer no garantiza
// un orden estable entre paginas sucesivas de /Items. Con un catalogo grande
// (miles de articulos, varias paginas de 500), si el orden por defecto no es
// determinista, un articulo puede "caer en la grieta" entre dos paginas y
// quedar fuera del Set de esa corrida -- aunque su Properties1 sea 'tYES'.
// Caso real confirmado 10-ago-2026: item 10217391 (TimeWise Antioxidant
// Moisturizer), confirmado Properties1='tYES' via consulta directa, quedaba
// excluido del calculo de produccion de una orden (DocEntry 4154) incluso
// despues de un sync completo fresco (syncedAt confirmado en la BD el mismo
// dia). $orderby='ItemCode' hace que la paginacion sea deterministica y evita
// que esto vuelva a pasar.
export async function fetchSection1ItemCodes(): Promise<Set<string>> {
  const codes = new Set<string>();
  let skip = 0;

  while (true) {
    logger.debug(`SAP: Items skip=${skip}`);
    const data = await sapGet<SapListResponse<{ ItemCode: string; Properties1: string }>>('/Items', {
      $select: 'ItemCode,Properties1',
      $orderby: 'ItemCode',
      $top: String(PAGE_SIZE),
      $skip: String(skip),
    });

    const items = data.value || [];
    for (const item of items) {
      if (item.Properties1 === 'tYES') codes.add(item.ItemCode);
    }

    // Ver comentario en SapListResponse/esPaginaFinal -- no basta con @odata.nextLink.
    if (esPaginaFinal(data, items, PAGE_SIZE)) break;
    skip += items.length;
  }

  logger.info(`SAP: ${codes.size} articulos de Seccion 1 (QryGroup1)`);
  return codes;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function fetchOrdersSince(sinceDate: Date): Promise<SapOrder[]> {
  const all: SapOrder[] = [];
  let skip = 0;
  const dateStr = sinceDate.toISOString().slice(0, 10);

  while (true) {
    logger.debug(`SAP: Orders skip=${skip} desde=${dateStr}`);
    const data = await sapGet<SapListResponse<SapOrder>>('/Orders', {
      $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,DocumentStatus,Cancelled,DocumentLines',
      $filter: `DocDate ge '${dateStr}'`,
      $orderby: 'DocDate asc',
      $top: String(ORDERS_PAGE_SIZE),
      $skip: String(skip),
    });

    const items = data.value || [];
    all.push(...items);

    // Ver comentario en SapListResponse/esPaginaFinal -- no basta con @odata.nextLink.
    if (esPaginaFinal(data, items, ORDERS_PAGE_SIZE)) break;
    skip += items.length;
  }

  logger.info(`SAP: ${all.length} órdenes obtenidas desde ${dateStr}`);
  return all;
}

export async function fetchAllOrders(): Promise<SapOrder[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  return fetchOrdersSince(since);
}

// ─── CreditNotes ──────────────────────────────────────────────────────────────

export interface SapCreditNote {
  DocEntry: number;
  DocNum:   number;
  CardCode: string;
  DocDate:  string;
  DocTotal: number;
  Cancelled: string;  // 'tYES' | 'tNO'
  Comments?: string | null;
  U_NCF?:    string | null;  // factura original afectada
  U_NCF_NC?: string | null;  // NCF de esta nota de crédito
}

export async function fetchCreditNotesSince(sinceDate: Date): Promise<SapCreditNote[]> {
  const all: SapCreditNote[] = [];
  let skip = 0;
  const dateStr = sinceDate.toISOString().slice(0, 10);

  while (true) {
    logger.debug(`SAP: CreditNotes skip=${skip} desde=${dateStr}`);
    const data = await sapGet<SapListResponse<SapCreditNote>>('/CreditNotes', {
      $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,Cancelled,Comments,U_NCF,U_NCF_NC',
      $filter: `DocDate ge '${dateStr}'`,
      $orderby: 'DocDate asc',
      $top: String(PAGE_SIZE),
      $skip: String(skip),
    });

    const items = data.value || [];
    all.push(...items);

    // Ver comentario en SapListResponse/esPaginaFinal -- no basta con @odata.nextLink.
    if (esPaginaFinal(data, items, PAGE_SIZE)) break;
    skip += items.length;
  }

  logger.info(`SAP: ${all.length} notas de crédito obtenidas desde ${dateStr}`);
  return all;
}

export async function fetchAllCreditNotes(): Promise<SapCreditNote[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  return fetchCreditNotesSince(since);
}
