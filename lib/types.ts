export interface Company {
  Id: number;
  CompanyUUID: string;
  CompanyName: string;
  TradingName: string | null;
  ABN: string | null;
  ContactName: string | null;
  ContactPhone: string | null;
  ContactEmail: string | null;
  CompanyType: string | null;
  Status: string | null;
  Notes: string | null;
  CreatedAt1: string;
  UpdatedAt1: string;
}

export interface Site {
  Id: number;
  SiteUUID: string;
  SiteCode: string;
  SiteName: string;
  ProjectNumber: string | null;
  Address: string | null;
  Suburb: string | null;
  State: string | null;
  Postcode: string | null;
  SiteManager: string | null;
  SiteManagerPhone: string | null;
  Client: string | null;
  Status: string | null;
  StartDate: string | null;
  CompletionDate: string | null;
  Latitude: number | null;
  Longitude: number | null;
  SiteQRCodeURL: string | null;
  Notes: string | null;
  CreatedAt1: string;
  UpdatedAt1: string;
}

export interface Person {
  Id: number;
  PersonUUID: string;
  FirstName: string;
  LastName: string;
  Mobile: string | null;
  Email: string | null;
  JobRole: string | null;
  WorkerType: string | null;
  EmergencyContactName: string | null;
  EmergencyContactPhone: string | null;
  WhiteCardNumber: string | null;
  WhiteCardExpiry: string | null;
  WhiteCardImage: string | null;
  WhiteCardVerified: boolean;
  LicenceNumber: string | null;
  LicenceType: string | null;
  LicenceExpiry: string | null;
  LicenceImage: string | null;
  InductionStatus: string | null;
  InductionDate: string | null;
  InductionExpiry: string | null;
  AccessTokenHash: string | null;
  PasscodeHash: string | null;
  AccessEnabled: boolean;
  PrivacyAcceptedAt: string | null;
  PrivacyVersion: string | null;
  AnonymisedAt: string | null;
  Photo: string | null;
  PersonPhoto: string | null;
  Notes: string | null;
  Companies_id: number | null;
  Company: { Id: number; CompanyName: string } | number | null;
  CreatedAt1: string;
  UpdatedAt1: string;
}

export interface SiteAccess {
  Id: number;
  SiteAccessUUID: string;
  AccessStatus: string;
  ApprovedBy: string | null;
  ApprovedDate: string | null;
  StartDate: string | null;
  EndDate: string | null;
  SiteInductionComplete: boolean;
  SiteInductionDate: string | null;
  Notes: string | null;
  Sites_id: number;
  People_id: number;
  Site: { Id: number; SiteUUID: string } | number;
  Person: { Id: number; PersonUUID: string } | number;
  CreatedAt1: string;
  UpdatedAt1: string;
}

export interface Attendance {
  Id: number;
  AttendanceUUID: string;
  AttendanceType: string | null;
  SignInTime: string | null;
  SignOutTime: string | null;
  SignInMethod: string | null;
  WorkActivity: string | null;
  AcknowledgedSiteRules: boolean;
  FitForWorkConfirmed: boolean;
  SignInIP: string | null;
  SignOutIP: string | null;
  SignInUserAgent: string | null;
  SignOutUserAgent: string | null;
  Status: string | null;
  Sites_id: number;
  People_id: number | null;
  Visitors_id: number | null;
  Companies_id: number | null;
  Site: { Id: number; SiteUUID: string; SiteName?: string } | number;
  Person: { Id: number; PersonUUID: string; FirstName?: string; LastName?: string } | number | null;
  Visitor: { Id: number; VisitorUUID: string } | number | null;
  Company: { Id: number; CompanyName: string } | number | null;
  CreatedAt1: string;
  UpdatedAt1: string;
}

export interface Visitor {
  Id: number;
  VisitorUUID: string;
  FirstName: string;
  LastName: string;
  Mobile: string | null;
  Email: string | null;
  CompanyName: string | null;
  ReasonForVisit: string | null;
  PersonVisiting: string | null;
  EmergencyContactName: string | null;
  EmergencyContactPhone: string | null;
  Notes: string | null;
  PrivacyAcceptedAt: string | null;
  PrivacyVersion: string | null;
  AnonymisedAt: string | null;
  CreatedAt1: string;
}

export interface Induction {
  Id: number;
  InductionUUID: string;
  InductionType: string | null;
  InductionVersion: string | null;
  CompletedAt: string | null;
  ExpiresAt: string | null;
  Accepted: boolean;
  Signature: string | null;
  SignatureImage: string | null;
  RulesSnapshot: string | null;
  DocumentURL: string | null;
  Status: string | null;
  People_id: number | null;
  Sites_id: number | null;
  Person: { Id: number; PersonUUID: string } | number | null;
  Site: { Id: number; SiteUUID: string } | number | null;
  CreatedAt1: string;
  UpdatedAt1: string;
}

export interface AuditLog {
  Id: number;
  AuditUUID: string;
  EventType: string;
  Person: string | null;
  Attendance: string | null;
  Site: string | null;
  PerformedBy: string | null;
  Source: string | null;
  OldValue: string | null;
  NewValue: string | null;
  IPAddress: string | null;
  UserAgent: string | null;
  CreatedAt1: string;
}