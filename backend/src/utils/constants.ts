// Configuracion de negocio ajustable sin tocar la logica de calculo.
// Cambia estos valores y corre un Sync Completo para que se re-calculen
// las ventas existentes con la nueva configuracion.

// REGLA CONFIRMADA (julio 2026) con el contacto de SAP y validada al centavo
// contra el reporte real de "Comision Por Produccion De Unidad":
//
// La produccion de una orden solo cuenta los articulos de "Seccion 1"
// (tabla OITM, campo QryGroup1 = 'Y' -- expuesto por el Service Layer como
// Properties1 = 'tYES'). Los articulos de Seccion 2 (kits, bolsas, catalogos,
// tickets, etc.) NO cuentan como produccion, sin importar si tuvieron
// descuento aplicado en la orden o no.
//
// El monto final se calcula como: suma(LineTotal de lineas Seccion 1) * 1.18
// (LineTotal en SAP viene neto, sin ITBIS -- se multiplica para obtener el
// equivalente bruto, consistente con el resto del sistema donde
// "neta" = bruta / 1.18).
//
// Validado el 2026-07-13 contra la unidad "Mujeres Virtuosas" (B00838),
// junio 2026: nuestro calculo dio RD$805,607.49 vs RD$805,607.50 del reporte
// real de SAP (diferencia de 1 centavo por redondeo).
//
// Si es false, se usa el DocTotal completo de la orden (sin filtrar por
// Seccion 1) -- solo para poder comparar/revertir rapido si algo se rompe.
export const ONLY_SECTION_1_PRODUCTS = true;
