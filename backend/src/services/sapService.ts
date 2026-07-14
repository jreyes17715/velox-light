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
}

const PAGE_SIZE = 500;
// Orders trae las líneas de detalle (DocumentLines) embebidas, lo que infla mucho
// el tamaño de cada página. Un $top más chico reduce el riesgo de ECONNRESET.
const ORDERS_PAGE_SIZE = 50;

// ─── BusinessPartners ────────────────────────────────────────────────────────

export async function fetchAllBusinessPartners(): Promise<SapBusinessPartner[]> {
  const all: SapBusinessPartner[] = [];
  let skip = 0;

  while (true) {
    logger.debug(`SAP: BusinessPartners skip=${skip}`);
    const data = await sapGet<SapListResponse<SapBusinessPartner>>('/BusinessPartners', {
      $select: 'CardCode,CardName,EmailAddress,GroupCode,U_Tipo,U_CodIni,U_NomIni,U_DIQ',
      $filter: "CardType eq 'cCustomer'",
      $top: String(PAGE_SIZE),
      $skip: String(skip),
    });

    const items = data.value || [];
    all.push(...items);

    if (items.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  logger.info(`SAP: ${all.length} BusinessPartners obtenidos`);
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
      $top: String(PAGE_SIZE),
      $skip: String(skip),
    });

    const items = data.value || [];
    all.push(...items);

    if (items.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
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

export async function fetchSection1ItemCodes(): Promise<Set<string>> {
  const codes = new Set<string>();
  let skip = 0;

  while (true) {
    logger.debug(`SAP: Items skip=${skip}`);
    const data = await sapGet<SapListResponse<{ ItemCode: string; Properties1: string }>>('/Items', {
      $select: 'ItemCode,Properties1',
      $top: String(PAGE_SIZE),
      $skip: String(skip),
    });

    const items = data.value || [];
    for (const item of items) {
      if (item.Properties1 === 'tYES') codes.add(item.ItemCode);
    }

    if (items.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
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

    if (items.length < ORDERS_PAGE_SIZE) break;
    skip += ORDERS_PAGE_SIZE;
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

    if (items.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  logger.info(`SAP: ${all.length} notas de crédito obtenidas desde ${dateStr}`);
  return all;
}

export async function fetchAllCreditNotes(): Promise<SapCreditNote[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  return fetchCreditNotesSince(since);
}
