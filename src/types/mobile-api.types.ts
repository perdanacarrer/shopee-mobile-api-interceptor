export interface MobileClientConfig {
  deviceId: string;
  baseUrl?: string;
  timeout?: number;
  authConfig: AuthConfig;
  proxyConfig?: ProxyConfig;
  retryConfig?: RetryConfig;
}

export interface AuthConfig {
  email: string;
  password: string;
  deviceModel?: string;
  androidVersion?: string;
  appVersion?: string;
  deviceId: string;
}

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https' | 'socks5';
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryOnStatus: number[];
  backoffFactor: number;
}

export interface SearchParams {
  keyword: string;
  limit?: number;
  offset?: number;
  sort?: 'popular' | 'latest' | 'price_asc' | 'price_desc';
  filter?: Record<string, any>;
  deviceIndex?: number;
}

export interface ProductSearchResponse {
  code: number;
  data: {
    items: ProductItem[];
    total: number;
    offset: number;
  };
  message?: string;
}

export interface ProductItem {
  id: string;
  name: string;
  price: number;
  currency: string;
  imageUrl: string;
  shopId: string;
  shopName: string;
  rating: number;
  sold: number;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetailResponse {
  code: number;
  data: ProductDetail;
  message?: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  images: string[];
  shop: ShopInfo;
  attributes: ProductAttribute[];
  ratings: RatingSummary;
  variants: ProductVariant[];
  stock: number;
  category: CategoryInfo;
  specifications: Record<string, any>;
  reviews: Review[];
}

export interface ShopInfo {
  id: string;
  name: string;
  rating: number;
  followers: number;
  joinedAt: string;
  location: string;
  responseRate: number;
  responseTime: number;
}

export interface ProductAttribute {
  name: string;
  value: string;
  type: string;
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<number, number>;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  stock: number;
  attributes: Record<string, string>;
}

export interface CategoryInfo {
  id: string;
  name: string;
  parentId?: string;
  level: number;
}

export interface Review {
  id: string;
  userId: string;
  username: string;
  rating: number;
  content: string;
  createdAt: string;
  images: string[];
  likes: number;
  hasReply: boolean;
}