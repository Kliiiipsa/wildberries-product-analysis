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

export interface DashboardProduct {
  article: string;
  name: string;
  brand: string;
  priceSale: number;
  priceBasic: number;
  salePercent: number;
  totalStock: number;
  photoUrl?: string;
  ordersCount: number;
  buyoutsCount: number;
  buyoutPercent: number;
  addToCartCount: number;
  views: number;
  ordersYesterday: number;
  addToCartYesterday: number;
  buyoutPercentYesterday: number;
  hasYesterdayData: boolean;
}

export interface DashboardData {
  products: DashboardProduct[];
  sellerLabel: string;
  tagId: number;
  fetchedAt: string;
  periodFrom: string;
  periodTo: string;
}

// ── Сравнение с конкурентами ─────────────────────────────────────────────────

export interface CompetitorEntry {
  nmId: number;
  variantArticle?: string; // артикул варианта для фильтрации склейки
  label?: string;          // пользовательская метка
}

export interface CompetitorStats {
  nmId: number;
  name: string;
  brand: string;
  price: number;           // базовая цена
  priceSale: number;       // цена со скидкой
  discount: number;        // % скидки
  sales7d: number;         // продажи за 7 дней (оценка MPSTATS)
  revenue7d: number;       // выручка за 7 дней (оценка)
  stockTotal: number;      // остатки (оценка)
  rating: number;
  reviewCount: number;
  photoUrl?: string;
  isMine: boolean;
  dataError?: string;      // если MPSTATS не вернул данные
}

export interface ComparisonData {
  products: CompetitorStats[];
  period: { from: string; to: string };
  fetchedAt: string;
}

export interface DashboardAdCampaign {
  advertId: number;
  name: string;
  status: number;         // 9=active, 11=paused, 7=completed, 4=ready
  paymentType: string;    // "cpc" | "cpm"
  bidType: string;        // "manual" | "unified" | ""
  numericType: number;    // fallback: 8=авто, 6=поиск, 4=каталог, 9=поиск+каталог
  views: number;        // показы за 7 дн по этому nmId
  clicks: number;       // клики
  atbs: number;         // добавления в корзину
  orders: number;       // заказы
  sum7d: number;        // расход ₽
  sum_price: number;    // выручка ₽
  ctr: number;          // %
  cpc: number;          // ₽
  drr: number;          // %
  budgetRemaining: number; // остаток бюджета кампании ₽ (0 если недоступно)
}

export interface DashboardAdsResult {
  ads: Record<string, DashboardAdCampaign | null>;  // keyed by nmId string
  accountBalance: number;   // общий баланс рекламного кабинета
  fetchedAt: string;
}

// ── What-If Simulator ────────────────────────────────────────────────────────

export interface WhatIfUnitCost {
  zakupka: number;
  kargo: number;
  logistika: number;
  hranenie: number;         // ₽ в день
  komissiyaRub: number;
  ekvairingPercent: number; // %
  ndsRub: number;           // ₽ (если итого)
  ndsPercent: number;       // % (если ставка)
  hasData: boolean;
}

export interface WhatIfBaseData {
  nmId: number;
  productName: string;
  brand: string;
  photoUrl?: string;
  priceSale: number;
  priceBasic: number;
  salePercent: number;
  stock: number;
  dailySales: number;    // средние заказы в день (из MPStats или WB stats)
  buyoutRate: number;    // 0–100 (%)
  unitCost: WhatIfUnitCost;
  weeklyOrders: number;  // факт заказов за 7 дней (WB stats)
  weeklyBuyouts: number; // факт выкупов за 7 дней
  weeklyRevenue: number; // факт выручки за 7 дней
  conversions: {
    cardToCart: number;  // карточка → корзина, %
    cartToOrder: number; // корзина → заказ, %
  };
}

export interface WhatIfParams {
  newPrice: number;
  dailyAdBudget: number;
  cpcBid: number;
  adType: 'ARK' | 'CPC' | 'PRK';
  newStock: number;
}

export interface WhatIfForecast {
  orders: number;
  buyouts: number;
  revenue: number;
  marginPerUnit: number;
  marginWithoutAd: number;
  marginWithAd: number;
  adSpend: number;
  roi: number;
}
