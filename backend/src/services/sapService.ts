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
}

export interface SapBusinessPartnerGroup {
  Code: number;        // mismo valor que BusinessPartner.GroupCode
  Name: string;        // nombre del grupo, e.g. "Mujeres de Valor"
  U_CardCode?: string; // CardCode de la directora de este grupo
  U_CardName?: string; // Nombre de la directora
}

export interface SapOrder {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  DocDate: string;        // "2024-12-15"
  DocTotal: number;
  DocumentStatus: string; // 'O' = Open, 'C' = Closed
  Cancelled: string;      // 'Y' | 'N'
}

interface SapListResponse<T> {
  value: T[];
}

const PAGE_SIZE = 500;

// ─── BusinessPartners ────────────────────────────────────────────────────────

export async function fetchAllBusinessPartners(): Promise<SapBusinessPartner[]> {
  const all: SapBusinessPartner[] = [];
  let skip = 0;

  while (true) {
    logger.debug(`SAP: BusinessPartners skip=${skip}`);
    const data = await sapGet<SapListResponse<SapBusinessPartner>>('/BusinessPartners', {
      $select: 'CardCode,CardName,EmailAddress,GroupCode,U_Tipo,U_CodIni,U_NomIni',
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

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function fetchOrdersSince(sinceDate: Date): Promise<SapOrder[]> {
  const all: SapOrder[] = [];
  let skip = 0;
  const dateStr = sinceDate.toISOString().slice(0, 10);

  while (true) {
    logger.debug(`SAP: Orders skip=${skip} desde=${dateStr}`);
    const data = await sapGet<SapListResponse<SapOrder>>('/Orders', {
      $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,DocumentStatus,Cancelled',
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
