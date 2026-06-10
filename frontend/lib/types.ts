/** Shared API types mirroring the backend (SRS v1.1 §8/§9). */

export type Role = 'citizen' | 'department_worker' | 'admin' | 'super_admin';

export type ReportStatus =
  | 'SUBMITTED' | 'UNDER_REVIEW' | 'VERIFIED' | 'ASSIGNED' | 'IN_PROGRESS'
  | 'RESOLVED' | 'REJECTED' | 'DUPLICATE' | 'NEEDS_MORE_INFO' | 'ARCHIVED';

export type Severity = 'low' | 'medium' | 'high' | 'urgent';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
  trustScore: number;
  phone: string | null;
  phoneIsPublic: boolean;
  createdAt: string;
}

export interface VoteCounts {
  upvotes: number;
  confirms: number;
  falseReports: number;
}

export interface ReportImage {
  id: string;
  imageUrl: string;
  imageType: 'before' | 'after' | 'evidence';
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export interface Department {
  id: string;
  name: string;
  description?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  isActive?: boolean;
}

export interface Report {
  id: string;
  userId: string;
  title: string;
  description: string;
  categoryId: string;
  category?: { id: string; name: string; icon?: string | null };
  status: ReportStatus;
  severity: Severity;
  latitude: number;
  longitude: number;
  address: string | null;
  landmark: string | null;
  assignedDepartmentId: string | null;
  priorityScore: number;
  duplicateOfReportId: string | null;
  internalNote?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  images?: ReportImage[];
  counts?: VoteCounts;
  distanceM?: number;
}

export interface Comment {
  id: string;
  reportId: string;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  oldStatus: ReportStatus | null;
  newStatus: ReportStatus;
  note: string | null;
  changedBy: { id: string; name: string; role: Role };
  createdAt: string;
}

export interface Notification {
  id: string;
  reportId: string | null;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface MapMarker {
  id: string;
  title: string;
  status: ReportStatus;
  severity: Severity;
  categoryId: string;
  latitude: number;
  longitude: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
