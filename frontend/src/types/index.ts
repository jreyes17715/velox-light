export interface User {
  userId: string;
  sapUserId: string;
  name: string;
  email: string | null;
  role: 'directora' | 'consultora';
  unitName: string | null;
  isSuperAdmin: boolean;
  supervisorId: string | null;
  subordinates: { id: string; name: string; sapUserId: string }[];
}

export interface OverviewData {
  user: { name: string; role: string; unitName?: string | null };
  totalSales: number;
  targetAmount: number;
  achievementPercent: number;
  salesCount: number;
  subordinateCount: number;
  currency: string;
  period: { month: number; year: number };
}

export interface SubordinateData {
  id: string;
  name: string;
  sapUserId: string;
  totalSales: number;
  targetAmount: number;
  achievementPercent: number;
  salesCount: number;
}

export interface Sale {
  id: string;
  sapOrderId: string;
  sapDocNum: number | null;
  amount: number;
  currency: string;
  saleDate: string;
  status: string;
  userId: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}
