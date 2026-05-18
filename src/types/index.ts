export interface WBProduct {
  article: string;
  name: string;
  brand: string;
  supplierId: number;
  imtId: number;
  subjectName: string;
  subjectParentName: string;
  pics: number;
  rating: number;
  feedbacks: number;
  priceBasic: number;
  priceSale: number;
  salePercent: number;
  totalStock: number;
  stocks: WBStockItem[];
  colors: string[];
  description?: string;
  mediaTypes?: string;
  photoUrl?: string;
}

export interface WBStockItem {
  warehouseId: number;
  warehouseName?: string;
  qty: number;
}


export interface WBStats {
  period: string;
  views: number;
  openCardCount: number;
  addToCartCount: number;
  addToWishlist: number;
  ordersCount: number;
  ordersSumRub: number;
  buyoutsCount: number;
  buyoutsSumRub: number;
  buyoutPercent: number;
  cancelCount: number;
  cancelSumRub: number;
  avgPriceRub: number;
  avgOrdersCountPerDay: number;
  conversions: {
    addToCartPercent: number;
    cartToOrderPercent: number;
    buyoutsPercent: number;
  };
}

export interface WBAdCampaign {
  advertId: number;
  name: string;
  type: number;
  status: number;
  views: number;
  clicks: number;
  ctr: number;
  cpc: number;
  sum: number;
  atbs: number;
  orders: number;
  cr: number;
  shks: number;
  sum_price: number;
}

export interface WBAdvertising {
  totalSpend: number;
  totalOrders: number;
  avgCtr: number;
  avgCpc: number;
  drr: number;
  campaigns: WBAdCampaign[];
  note: string;
  productName?: string;
}

export interface GoogleSheetUnit {
  found: boolean;
  article: string;
  headers: string[];
  values: string[];
  rawText: string;
}

export interface MpstatsCompetitor {
  article: string;
  name: string;
  brand: string;
  price: number;
  rating: number;
  feedbacks: number;
  sales30: number;
  revenue30: number;
  balance: number;
  colors_count?: number;
}

export interface MpstatsPosition {
  keyword: string;
  position: number;
  page: number;
  frequency: number;
}

export interface MpstatsSemantic {
  keyword: string;
  frequency: number;
  ctr?: number;
}

export interface MpstatsTrend {
  category: string;
  currentPeriodSales: number;
  prevPeriodSales: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  seasonComment: string;
}

export interface MpstatsData {
  productInfo?: {
    sales30: number;
    revenue30: number;
    avgPrice: number;
    position: number;
  };
  competitors: MpstatsCompetitor[];
  positions: MpstatsPosition[];
  semantics: MpstatsSemantic[];
  trend?: MpstatsTrend;
}

export interface SeasonalityData {
  keyword: string;
  productName: string;
  category: string;
  seasonality: Record<string, number>; // "1"–"12" → коэффициент
}

export interface AnalysisData {
  article: string;
  product: WBProduct | null;
  stats: WBStats | null;
  advertising: WBAdvertising | null;
  unitData: GoogleSheetUnit | null;
  mpstatsData: MpstatsData | null;
  seasonalityData: SeasonalityData | null;
  errors: Record<string, string>;
  collectedAt: string;
}

export interface StreamEvent {
  type: 'status' | 'token' | 'done' | 'error' | 'data' | 'prompt';
  message?: string;
  content?: string;
  payload?: AnalysisData;
  prompt?: string;
  error?: string;
}
