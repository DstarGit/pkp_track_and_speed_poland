export type SortCriterion = 'distance' | 'duration';

export type MainTab = 'longest' | 'longestSegments' | 'speeds';

export type SpeedViewMode = 'segments' | 'fullRoutes';

export type CategoryGroup =
  | 'EIP'
  | 'EIC_EC'
  | 'IC'
  | 'TLK_IR'
  | 'ACCELERATED'
  | 'LOCAL';

export type TrainLiveStatusCode = 'S' | 'P' | 'C' | 'X' | 'Q';

export interface RouteStop {
  stationId: number;
  orderNumber: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  arrivalTime: string | null;
  departureTime: string | null;
  arrivalDayOffset: number;
  departureDayOffset: number;
  dwellMinutes: number | null;
  platform: string | null;
  track: string | null;
  cumulativeKm: number;
  segmentKm: number;
  segmentDurationSeconds: number | null;
  segmentSpeedKmh: number | null;
  stopTypeName: string | null;
  country: string | null;
  isOrigin: boolean;
  isDestination: boolean;
}

export interface LiveOperationInfo {
  trainStatus: TrainLiveStatusCode;
  statusLabel: string;
  delayMinutes: number | null;
  lastConfirmedStationName: string | null;
}

export interface LongestConnection {
  id: string;
  scheduleId: number;
  orderId: number;
  trainNumber: string;
  trainName: string | null;
  carrierCode: string;
  carrierName: string;
  categorySymbol: string;
  categoryGroup: CategoryGroup;
  originName: string;
  originId: number;
  destinationName: string;
  destinationId: number;
  startTime: string;
  endTime: string;
  endDayOffset: number;
  durationMinutes: number;
  durationSeconds: number;
  distanceKm: number;
  directDistanceKm: number;
  avgSpeedKmh: number;
  stopsCount: number;
  isDomestic: boolean;
  stops: RouteStop[];
  shapePoints?: [number, number][];
  distanceSource: 'gtfs_shape' | 'haversine';
  live: LiveOperationInfo | null;
}

export interface SpeedSegmentRecord {
  id: string;
  tripId: string;
  trainNumber: string;
  trainName: string | null;
  carrierCode: string;
  carrierName: string;
  categorySymbol: string;
  categoryGroup: CategoryGroup;
  fromStationId: number;
  fromStationName: string;
  fromLat: number | null;
  fromLon: number | null;
  toStationId: number;
  toStationName: string;
  toLat: number | null;
  toLon: number | null;
  departureTime: string;
  arrivalTime: string;
  endDayOffset: number;
  distanceKm: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  isDomestic: boolean;
  routeOriginName: string;
  routeDestinationName: string;
}

export interface CarrierSummary {
  code: string;
  name: string;
  count: number;
}

export interface ConnectionsResponse {
  date: string;
  fetchedAt: string;
  fromCache: boolean;
  hasLiveOperations: boolean;
  sourceName: string;
  feedVersion: string | null;
  feedDateRange: { from: string; to: string } | null;
  totalAnalyzedRoutes: number;
  hubStationsMatched: number;
  connections: LongestConnection[];
  carriers: CarrierSummary[];
}

export interface SpeedsResponse {
  date: string;
  fetchedAt: string;
  fromCache: boolean;
  sourceName: string;
  feedDateRange: { from: string; to: string } | null;
  totalAnalyzedRoutes: number;
  totalAnalyzedSegments: number;
  segments: SpeedSegmentRecord[];
  fullRoutes: LongestConnection[];
  carriers: CarrierSummary[];
}

export interface LongestSegmentsResponse {
  date: string;
  fetchedAt: string;
  fromCache: boolean;
  sourceName: string;
  feedDateRange: { from: string; to: string } | null;
  totalAnalyzedRoutes: number;
  totalAnalyzedSegments: number;
  segments: SpeedSegmentRecord[];
  carriers: CarrierSummary[];
}

export type GtfsApiErrorCode =
  | 'OUT_OF_RANGE'
  | 'FEED_DOWNLOAD_ERROR'
  | 'PARSE_ERROR'
  | 'TRIP_NOT_FOUND';

export interface ApiErrorPayload {
  code: GtfsApiErrorCode;
  message: string;
  details?: string;
}
