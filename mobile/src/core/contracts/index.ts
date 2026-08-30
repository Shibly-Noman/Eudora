/**
 * Hand-written mirrors of the api-service response shapes.
 *
 * The backend serves OpenAPI at `/api/docs-json` (see api-service `main.ts`),
 * but it carries exactly one @nestjs/swagger decorator, so the generated
 * document describes routes and says nothing useful about response bodies.
 *
 * There used to be a checked-in `generated/openapi.d.ts` beside this file. It
 * was deleted in W3: nothing imported it, and by then it still described the
 * messaging and timetable endpoints the API had removed — a stale snapshot
 * nobody would get a compiler warning for trusting. `pnpm openapi:generate`
 * recreates it whenever that becomes worth doing, which is once the API's DTOs
 * are actually annotated. Until then, this file is the source of truth.
 *
 * Because these are hand-written, `tsc` cannot tell you when they drift from
 * the API. It passed clean while four of the types below described endpoints
 * that no longer existed. Treat a green typecheck here as proof of internal
 * consistency only, never of contract accuracy.
 *
 * Nothing here may import React or react-native: `core` is deliberately
 * platform-free so it can be lifted into a shared package for the TV target.
 */

// ─── Envelope ────────────────────────────────────────────────────────────────

export interface ApiMeta {
  requestId: string;
  timestamp: string;
  version: string;
  path: string;
  method: string;
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  code: string;
  message: string;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  code: string;
  message: string;
  errors?: { field?: string; code: string; message: string }[];
  meta: ApiMeta;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Mirrors CurrentUserDto (services/api-service/src/auth/dto/current-user.dto.ts)
 * exactly — `roles` is a flat string array, already flattened server-side from
 * the `UserRole -> Role` relation; it is not `{ role: { name } }[]`.
 *
 * `studentProfile`/`guardianProfile` presence (not `roles`) is the routing
 * signal for role-aware screens — a user can hold both the GUARDIAN role and
 * a student profile (the schema allows it, even if no seeded account does
 * today), so branch on "do they have guardian data to show" rather than on
 * role membership alone.
 */
export interface AuthUserStudentProfile {
  id: string;
  fullName: string;
  phone: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface AuthUserGuardianProfile {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: { action: string; subject: string }[];
  studentProfile: AuthUserStudentProfile | null;
  guardianProfile: AuthUserGuardianProfile | null;
}

export interface UpdateMyStudentProfilePayload {
  phone?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface UpdateGuardianProfilePayload {
  fullName?: string;
  email?: string;
  phone?: string;
}

export interface RegisterDeviceTokenPayload {
  token: string;
  platform: 'ios' | 'android' | 'web';
}

/** Response of the native token endpoints added in Phase 0. */
export interface TokenResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * `role` is deliberately absent: `resolveSelfSignupRole` on the server ignores
 * anything outside `USER`/`GUARDIAN` and falls back to `GUARDIAN` for an
 * absent or unrecognised hint — the exact default this app wants, since a
 * mobile signup is a guardian setting up the family, not a learner signing up
 * for themselves. Sending a role here would be asking the server to trust a
 * client-declared privilege level, which the allowlist exists specifically to
 * refuse.
 */
export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

/**
 * `HOMEWORK` and `LIVE_CLASS` landed in the API on 2026-08-17/20 and were
 * missing here, which mattered more than a missing union member usually does:
 * the item screen's fallthrough sent both kinds to `AssessmentItemView`, so
 * they rendered as a broken assessment rather than failing loudly.
 *
 * A `HOMEWORK` item is the *slot*; its brief comes from
 * `GET /catalog/module-items/:id/my-homework`. A `LIVE_CLASS` item resolves to
 * a different meeting per cohort, so its date and join link come from
 * `GET /catalog/module-items/:id/my-session`, not from the item.
 */
export type ModuleItemKind =
  | 'VIDEO'
  | 'READING'
  | 'DISCUSSION'
  | 'ASSESSMENT'
  | 'HOMEWORK'
  | 'LIVE_CLASS'
  | 'STORY';
export type CatalogStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface LearningSubject {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
}

export interface ModuleItem {
  id: string;
  conceptId: string;
  kind: ModuleItemKind;
  title: string;
  sortOrder: number;
  status: CatalogStatus;
  videoUrl: string | null;
  videoDurationSeconds: number | null;
  readingContent: string | null;
  assessmentId: string | null;
  /**
   * Ungated even for signed-out visitors. Distinguishing this from "locked"
   * is what lets the outline say *why* an item will not open — without it a
   * paywalled item is indistinguishable from an empty one.
   */
  isFreePreview: boolean;
  /**
   * Server-computed as `!(entitled || isFreePreview)`.
   *
   * When true the API deliberately nulls `videoUrl`, `readingContent` and
   * `assessmentId` while still returning the row — the learner is meant to see
   * that the item exists and be told to unlock it. Mobile has been receiving
   * this and ignoring it, so paywalled items render as blank ones. Wiring it up
   * is W6; having it in the contract is W1's job.
   */
  isContentLocked: boolean;
  isDone: boolean;
}

export interface CourseLesson {
  id: string;
  title: string;
  sortOrder: number;
  xpReward: number;
}

export interface CourseConcept {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  kind: 'CHAPTER' | 'CHECKPOINT';
  passThresholdPercent: number | null;
  lessons: CourseLesson[];
  items: ModuleItem[];
  /** Server-computed; a concept is done once every lesson under it is done. */
  isDone: boolean;
  /** Server-computed; chapters unlock strictly in sortOrder. */
  isLocked: boolean;
}

export interface CourseSummary {
  id: string;
  learningSubjectId: string;
  title: string;
  slug: string;
  description: string | null;
  estimatedHours: number | null;
  status: CatalogStatus;
  sortOrder: number;
  gradeBand: 'PRE_K_K' | 'G1_2' | 'G3_4' | 'G5_6' | null;
  /**
   * SELF_PACED sells an access window starting at purchase; LIVE sells a seat
   * in a dated `Batch` and needs one chosen before checkout can proceed —
   * `POST /billing/checkout-session` 400s without a `batchId` for one of
   * these. HYBRID behaves like SELF_PACED for buying purposes.
   */
  deliveryMode: 'SELF_PACED' | 'LIVE' | 'HYBRID';
  /** Null means not independently sellable — bundled into a Program only. */
  priceOneTimeCents: number | null;
  currency: string;
  installmentCount: number | null;
  /**
   * Whether a guardian (or staff) put this course in the student's learning
   * plan. Only present for student callers; a recommendation, not an access
   * gate — every listed course is openable either way.
   */
  isAssigned?: boolean;
  learningSubject: { id: string; name: string; code: string };
  _count: { concepts: number };
}

export interface CourseDetail extends Omit<CourseSummary, '_count'> {
  /**
   * Whole-course access, resolved server-side through the same acting-child
   * rules as everything else (`entitlements.resolveCourseAccess`). Per-item
   * `isContentLocked` is the finer-grained signal — a free-preview item can
   * be `false` even while this is `false` too.
   */
  isEntitled: boolean;
  concepts: CourseConcept[];
}

export interface UpdateModuleItemProgressPayload {
  completed?: boolean;
  lastPositionSeconds?: number;
  notes?: string;
}

export interface DiscussionPost {
  id: string;
  discussionThreadId: string;
  studentProfileId: string;
  parentPostId: string | null;
  body: string;
  createdAt: string;
  studentProfile: { id: string; fullName: string };
}

export interface DiscussionThread {
  id: string;
  moduleItemId: string;
  prompt: string;
  createdAt: string;
  posts: DiscussionPost[];
}

// ─── Lessons / Cards ─────────────────────────────────────────────────────────

export type CardType = 'CONCEPTUAL' | 'INTERACTIVE' | 'CHECKPOINT';

export type WidgetType =
  | 'STANDARD_MCQ'
  | 'SLIDER_MANIPULATIVE'
  | 'DRAG_AND_DROP_LABELS'
  | 'COORDINATE_PLOTTER'
  | 'GRID_MATCHING'
  | 'CODE_PLAYGROUND'
  | 'SHAPE_SHADING';

export interface QuestionOption {
  id: string;
  optionLabel: string;
  optionText: string;
  isCorrect: boolean;
}

export interface CardQuestion {
  id: string;
  prompt: string;
  questionType: string;
  widgetType: WidgetType | null;
  /** Regenerated per attempt from a deterministic seed; never trust locally. */
  widgetConfig: Record<string, any> | null;
  explanation: string | null;
  hints: string[];
  correctAnswer: string | null;
  options: QuestionOption[];
}

export interface LessonCard {
  id: string;
  lessonId: string;
  title: string;
  sortOrder: number;
  cardType: CardType;
  content: string;
  question: CardQuestion | null;
}

export interface LessonAttempt {
  id: string;
  lessonId: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  xpEarned: number;
  cardResponses: { cardId: string; isCorrect: boolean }[];
}

export interface LessonFlow {
  lesson: {
    id: string;
    conceptId: string;
    title: string;
    description: string | null;
    xpReward: number;
    cards: LessonCard[];
  };
  attempt: LessonAttempt;
}

export interface SubmitCardPayload {
  timeSpentSeconds: number;
  interactionState?: Record<string, any>;
  selectedOptionId?: string;
  responseText?: string;
}

export interface SubmitCardResult {
  isCorrect: boolean;
  explanation: string;
  xpEarned: number;
  isLessonComplete: boolean;
  /** Only sent on an incorrect submission — never alongside a correct one. */
  correctReveal?: { correctValue?: number };
}

// ─── Gamification ────────────────────────────────────────────────────────────

export interface GamificationMe {
  experience: { totalXp: number; level: number; nextLevelXp: number };
  streak: {
    currentStreak: number;
    longestStreak: number;
    lastActiveDate: string | null;
  };
  lessonsCompleted: number;
}

export interface DailyGoal {
  key: 'items' | 'videos' | 'readings';
  label: string;
  target: number;
  progress: number;
}

export interface TodaysGoals {
  goals: DailyGoal[];
}

export interface GamificationBadge {
  code: string;
  name: string;
  description: string;
  earned: boolean;
  progress: number;
  maxProgress: number;
}

export interface LeaderboardEntry {
  studentProfileId: string;
  fullName: string;
  totalXp: number;
  level: number;
  rank: number;
}

export interface LeaderboardResponse {
  data: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

// ─── HOMEWORK module items (`GET /catalog/module-items/:id/my-homework`) ────
//
// Distinct from `PendingHomeworkItem`/`HomeworkSubmissionRecord` in
// homeworkApi's domain: those describe standalone cohort homework reached from
// the Homework tab. This describes a course *checkpoint* — the item is shared
// by every learner in the course, and the brief carries no `batch`, because a
// self-paced buyer has none.

export interface ModuleItemHomeworkBrief {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  maxPoints: number;
}

export interface ModuleItemHomeworkSubmission {
  id: string;
  status: string;
  content: string | null;
  submissionDate: string;
  pointsEarned: number | null;
  feedback: string | null;
  gradedAt: string | null;
  /**
   * A resubmission *replaces* this list wholesale — the server deletes every
   * attachment not present in the new `attachmentFileIds` — so a client must
   * resend every file it wants kept, not just the newly added ones.
   */
  attachments: {
    fileUploadId: string;
    sortOrder: number;
    file: { originalName: string; size: number; mimetype: string };
  }[];
}

export interface ModuleItemHomework {
  homework: ModuleItemHomeworkBrief;
  /** Null when the caller has nothing submitted yet, or is staff previewing. */
  submission: ModuleItemHomeworkSubmission | null;
}

// ─── LIVE_CLASS module items (`GET /catalog/module-items/:id/my-session`) ───
//
// One LIVE_CLASS item resolves to a different `BatchSession` per cohort, so
// this is never on the item itself — it is resolved per caller.

export type LiveSessionUnavailableReason =
  /** Staff previewing the course; there is no session of their own to show. */
  | 'NOT_A_STUDENT'
  /** No active enrollment names a cohort for this course. */
  | 'NOT_IN_A_BATCH'
  /** Enrolled, but this course's batch has not scheduled this item yet. */
  | 'NOT_SCHEDULED';

export interface ModuleItemLiveSession {
  id: string;
  batchId: string;
  moduleItemId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  topic: string | null;
  teacherUserId: string | null;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  /** `NONE` until the Zoom Server-to-Server OAuth hook lands — `joinUrl` is
   * routinely null until then, distinct from a session that failed to get one. */
  provider: 'NONE' | 'ZOOM';
  externalMeetingId: string | null;
  /** Never `startUrl` — the API strips that server-side; it starts the
   * meeting and must never reach a learner. */
  joinUrl: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  batch: { id: string; name: string; code: string };
  teacher: { id: string; firstName: string; lastName: string } | null;
}

export interface ModuleItemLiveClass {
  session: ModuleItemLiveSession | null;
  reason: LiveSessionUnavailableReason | null;
}

// ─── Assessments ─────────────────────────────────────────────────────────────

export interface MyAssignmentForItem {
  id: string;
  status: string;
  dueAt: string;
}

export interface AssignmentAssessmentSummary {
  id: string;
  title: string;
  description: string | null;
  status: string;
  totalMarks: number;
  estimatedDurationMinutes: number | null;
  countsTowardGrade: boolean;
  maxAttempts: number | null;
}

export interface Assignment {
  id: string;
  assessmentId: string;
  studentProfileId: string;
  classSectionId: string;
  status: string;
  dueAt: string;
  assessment: AssignmentAssessmentSummary;
}

/**
 * Answer-key-free question shape — mirrors `CardQuestion` for `WidgetSelector`
 * compatibility, but has no `correctAnswer`/`option.isCorrect`: the backend
 * withholds both until the attempt is submitted and graded.
 */
export interface AttemptQuestionQuestion {
  id: string;
  questionType: string;
  prompt: string;
  widgetType: WidgetType | null;
  widgetConfig: Record<string, any> | null;
  hints: string[];
  options: { id: string; optionLabel: string; optionText: string }[];
}

export interface AttemptQuestion {
  id: string;
  sectionId: string;
  questionNumber: number;
  marksAvailable: number;
  section: { id: string; title: string; sortOrder: number };
  question: AttemptQuestionQuestion;
}

export interface AttemptResponse {
  id: string;
  questionId: string;
  selectedOptionId: string | null;
  responseText: string | null;
  interactionState: Record<string, any> | null;
  isCorrect: boolean | null;
  marksAwarded: number | null;
  marksAvailable: number;
  timeSpentSeconds: number;
  feedback: string | null;
}

export interface AssessmentAttempt {
  id: string;
  assessmentAssignmentId: string;
  attemptNumber: number;
  startedAt: string;
  submittedAt: string | null;
  rawScore: number | null;
  maxScore: number | null;
  percentageScore: number | null;
  resultStatus: 'in_progress' | 'submitted' | 'marked' | 'needs_review';
  responses: AttemptResponse[];
}

export interface StartAttemptPayload {
  assessmentAssignmentId: string;
}

export interface SaveResponsePayload {
  assessmentAttemptId: string;
  questionId: string;
  selectedOptionId?: string;
  responseText?: string;
  interactionState?: Record<string, any>;
  timeSpentSeconds?: number;
}

// ─── Entitlements & checkout ─────────────────────────────────────────────────
//
// `/billing/*` here is deliberately not `guardianApi.ts`'s domain: that file's
// `getInvoices`/`getPayments` are a read-only ledger of what already happened.
// Everything below is the *purchase* flow — resolving a price, opening Stripe
// Checkout, and polling for the webhook to land. `@Roles('SUPER_ADMIN',
// 'ADMIN', 'GUARDIAN')` on every one of these server-side; a student account
// (role USER) cannot reach any of it — this app has exactly one buyer per
// decision 2, the guardian, never the learner.

/** `GET /entitlements/me` — the acting child's owned course ids, for badging
 * the catalog. Distinct from `FamilyEntitlements` below, which is every
 * child's full entitlement detail, not just a course-id set for one. */
export interface MyEntitlements {
  isStaff: boolean;
  courseIds: string[];
}

export type SkuType = 'PROGRAM' | 'COURSE';

/**
 * `BLOCKED_ACTIVE_PLAN`: upgrading into a Program while a contained course is
 * mid-installment is refused outright rather than prorated — the message
 * explains why, so surface it rather than treating this like `NOT_SELLABLE`.
 */
export type SkuResolution =
  | 'AVAILABLE'
  | 'OWNED'
  | 'NOT_SELLABLE'
  | 'UPGRADE'
  | 'BLOCKED_ACTIVE_PLAN';

/**
 * `GET /billing/resolve-sku`'s point: the client never computes a price.
 * `priceCents` is what would actually be charged (after any upgrade credit);
 * `listPriceCents` is what to show struck through when they differ.
 */
export interface ResolvedSku {
  skuType: SkuType;
  skuId: string;
  resolution: SkuResolution;
  title: string;
  currency: string;
  listPriceCents: number | null;
  priceCents: number | null;
  creditAppliedCents: number;
  /** Courses inside a Program the family already owns a la carte — folded into the credit above. */
  overlappingCourseIds: string[];
  installmentsAvailable: boolean;
  installmentCount: number | null;
  amountPerInstallmentCents: number | null;
  finalInstallmentCents: number | null;
  /** Present on every non-`AVAILABLE` resolution; the reason to show the guardian. */
  message?: string;
}

export interface ResolveSkuPayload {
  studentProfileId: string;
  skuType: SkuType;
  skuId: string;
}

/** `GET /billing/courses/:courseId/batches` — cohorts with a seat open, for
 * the batch picker on a LIVE course. `seatsLeft: null` means uncapped. */
export interface OpenBatch {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  enrollmentDeadline: string | null;
  capacity: number | null;
  seatsLeft: number | null;
  leadTeacher: { id: string; fullName: string } | null;
}

export interface CreateCheckoutSessionPayload {
  studentProfileId: string;
  skuType: SkuType;
  skuId: string;
  /** `SUBSCRIPTION` is a real enum value server-side but the endpoint 400s on
   * it outright — omitted here so the type cannot express a request that
   * always fails. */
  billingMode: 'ONE_TIME' | 'INSTALLMENT';
  /** Required when `deliveryMode === 'LIVE'`. */
  batchId?: string;
}

/**
 * `checkoutUrl` is Stripe's own hosted page — open it in the system browser
 * (`Linking.openURL`), not a WebView. Where Stripe redirects afterward is the
 * *web* app's origin (`APP_URL` server-side); mobile has no way to change that
 * to a custom scheme, which is exactly why `orderId` is returned here up
 * front — poll `GET /billing/orders/:id` with it after the guardian returns to
 * the app, rather than trying to catch a redirect the app is never told about.
 */
export interface CheckoutSessionResult {
  orderId: string;
  checkoutUrl: string;
}

export type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

export interface OrderItemRecord {
  id: string;
  billingMode: string;
  priceCents: number;
  installmentCount: number | null;
  program: { id: string; name: string; slug: string } | null;
  course: { id: string; title: string; slug: string } | null;
  plan: {
    installmentsPaid: number;
    installmentCount: number;
    status: 'ACTIVE' | 'COMPLETED' | 'PAST_DUE' | 'CANCELLED';
    paidThroughDate: string | null;
  } | null;
  /** Only present via `GET /billing/orders/:id`, not `GET /billing/orders`. */
  entitlement?: { id: string; status: string } | null;
}

/** `GET /billing/orders/:id` (poll target) and `GET /billing/orders` (history) share this shape. */
export interface OrderRecord {
  id: string;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
  items: OrderItemRecord[];
}

/** `GET /billing/my-entitlements` — every child's ownership detail, grouped
 * by child. The family-wide "what do we own" view; `MyEntitlements` above is
 * narrower (one child, course ids only) and drives catalog badging instead. */
export interface FamilyChildEntitlements {
  studentProfileId: string;
  fullName: string;
  entitlements: {
    id: string;
    status: 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'REVOKED';
    source: 'PURCHASE' | 'ADMIN_GRANT' | 'TRIAL' | 'PROMO';
    accessExpiresAt: string | null;
    paidThroughDate: string | null;
    program: { id: string; name: string; slug: string } | null;
    course: { id: string; title: string; slug: string } | null;
    batch: { id: string; name: string; endDate: string | null } | null;
    orderItem: {
      plan: {
        installmentsPaid: number;
        installmentCount: number;
        status: 'ACTIVE' | 'COMPLETED' | 'PAST_DUE' | 'CANCELLED';
        paidThroughDate: string | null;
        amountPerInstallmentCents: number;
      } | null;
    } | null;
  }[];
}

// ─── Guardian / Parent ───────────────────────────────────────────────────────

export interface ChildClassSection {
  id: string;
  name: string;
  code: string;
}

export interface ChildLatestGrade {
  title: string;
  percentage: number | null;
  pointsEarned: number | null;
  pointsPossible: number | null;
  assessedAt: string;
}

/** `GET /parent/children` — one row per linked student. */
export interface ChildSummary {
  studentProfileId: string;
  fullName: string;
  birthDate: string;
  gender: string;
  classSection: ChildClassSection | null;
  /** Null when nothing has been recorded — render "not tracked", never a number. */
  attendanceRate: number | null;
  pendingHomeworkCount: number;
  latestGrade: ChildLatestGrade | null;
}

/** `GET /parent/children/:id/learning` — Eudora's own active-learning stats, not the legacy gradebook. */
export interface ChildLearningSummary {
  lessonsCompleted: number;
  currentStreak: number;
  longestStreak: number;
  totalXp: number;
  level: number;
}

/** `GET /parent/children/:id/teachers` */
export interface ChildTeacher {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  specialization: string | null;
}

/** `GET /parent/children/:id/attendance` */
export interface ChildAttendanceRecord {
  id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | string;
  remarks: string | null;
  classSection: { name: string };
}

/** `GET /parent/children/:id/homework` */
export interface ChildHomeworkItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  pointsPossible: number | null;
  courseName: string;
  submission: {
    id: string;
    status: string;
    submissionDate: string | null;
    feedback: string | null;
  } | null;
}

export interface CreateGuardianProfilePayload {
  fullName: string;
  email?: string;
  phone?: string;
}

/**
 * Deliberately just the two required fields. `CreateChildDto` also accepts an
 * optional `classId` (grade level) and `gender`, but nothing in this app reads
 * or lists classes yet — asking for a field with no picker built for it would
 * mean either a bare-uuid text field or a second new fetch-and-select flow
 * added purely for this form. Both are gender's own reasoning on the server
 * side ("every field between a parent and paying costs conversions"), applied
 * to a field the server comment doesn't explicitly exempt but nothing else in
 * the app currently depends on either.
 */
export interface CreateChildPayload {
  fullName: string;
  birthDate: string;
}

export interface CreatedChild {
  id: string;
  fullName: string;
}

export interface SelfLinkStudentPayload {
  studentEmail: string;
  relationshipType?: string;
}

/** `GET /parent/children/:id/grades` */
export interface ChildGradeEntry {
  id: string;
  title: string;
  category: string;
  pointsEarned: number | null;
  pointsPossible: number | null;
  percentage: number | null;
  status: string;
  assessedAt: string | null;
  batch: { name: string } | null;
  term: { name: string } | null;
}

// ─── Homework (student self-service — `/homework/*`'s student-facing routes
// are @Roles('USER', 'GUARDIAN', ...)) ─────────────────────────────────────

/**
 * Homework became a *course checkpoint* on 2026-08-20, which loosened two
 * fields that used to be guaranteed:
 *
 * - `batch` is null for a self-paced learner, who has no cohort at all.
 * - `dueDate` is null for the same reason — a self-paced checkpoint is worked
 *   through whenever the learner reaches it. Formatting it unconditionally
 *   renders "Invalid Date".
 *
 * `attachmentUrls` here is the *brief's* files, attached by the teacher who set
 * the work. It is unrelated to the learner's handed-in files, which are private
 * and never exposed as URLs — see `SubmitHomeworkPayload`.
 */
export interface PendingHomeworkItem {
  id: string;
  /** Set when this is a course checkpoint; null for standalone cohort homework. */
  moduleItemId: string | null;
  batchId: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  maxPoints: number;
  attachmentUrls: string[];
  batch: { id: string; name: string } | null;
}

/** One handed-in file, as returned by `POST /homework/attachments`. */
export interface HomeworkAttachmentUpload {
  id: string;
  originalName: string;
  size: number;
  mimetype: string;
}

export interface HomeworkSubmissionRecord {
  id: string;
  homeworkId: string;
  submissionDate: string;
  content: string | null;
  status: string;
  pointsEarned: number | null;
  feedback: string | null;
  /**
   * Present only on the `POST /homework/submit` response. The list read
   * (`GET /homework/student/:id`) does not include attachments at all, so this
   * is optional rather than a lie in one of the two directions.
   *
   * Files are served through `GET /homework/attachments/:fileId` with the
   * caller's bearer token — they are private, and there is no public URL to
   * hand to an `<Image>`.
   */
  attachments?: {
    fileUploadId: string;
    sortOrder: number;
    file: { originalName: string; size: number; mimetype: string };
  }[];
  homework: {
    title: string;
    maxPoints: number;
    dueDate: string | null;
    batch: { name: string } | null;
  };
}

export interface SubmitHomeworkPayload {
  homeworkId: string;
  content?: string;
  /**
   * Ids from `POST /homework/attachments`, never URLs. The old `attachmentUrls`
   * field let the caller say where a learner's work lived; the API dropped it,
   * and because the field is simply ignored rather than rejected, sending it
   * lost the attachments behind a successful 201.
   */
  attachmentFileIds?: string[];
}

// A schedule surface is deliberately absent, not missing. `TimetableSlot` was
// a weekly recurrence rule and the API retired it on 2026-08-21
// (`20260821120000_retire_timetable`); real meetings now live on `BatchSession`
// and are read through `GET /api/schedule/student/:id`, which has a different
// shape — no `periodIndex`, no `room`, actual start/end timestamps. Rebuilding
// a "today's sessions" screen against it is a new feature with a new type, not
// a restoration of this one.

// ─── Assessment list/history (`GET /students/:id/assignments`,
// `GET /students/:id/attempts`) — browsing, distinct from the existing
// deep-link-by-id attempt player in assessmentApi.ts ──────────────────────

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssignmentSummary {
  id: string;
  assessmentId: string;
  studentProfileId: string;
  classSectionId: string | null;
  opensAt: string | null;
  dueAt: string | null;
  status: string;
  assessment: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    totalMarks: number;
    estimatedDurationMinutes: number | null;
    countsTowardGrade: boolean;
    maxAttempts: number;
  };
  classSection: { id: string; code: string; name: string } | null;
}

export interface AttemptSummary {
  id: string;
  assessmentAssignmentId: string;
  attemptNumber: number;
  startedAt: string;
  submittedAt: string | null;
  rawScore: number | null;
  maxScore: number | null;
  percentageScore: number | null;
  resultStatus: string;
}

/** `GET /gradebook/student/:id/summary` */
export interface GradebookSummary {
  categoryAverages: Record<string, number>;
  termAverage: number | null;
  gpa: number | null;
  letterGrade: string;
  classRank: number | null;
  classPercentile: number | null;
}

/** `POST /auth/device/approve` — approving a TV pairing code from the phone. */
export interface ApproveDevicePairingResponse {
  approved: true;
}

/**
 * A narrated story, as `GET /stories/by-module-item/:id` returns it.
 *
 * Media arrives as a path, not a full URL, and always points at the API's own
 * routes rather than the object store — those routes re-check entitlement on
 * every request. Playing one therefore needs the bearer token attached, which
 * is why the player builds sources with headers rather than handing a bare
 * string to the audio element.
 */
export interface StoryAsset {
  id: string;
  url: string;
  altText: string;
}

export interface StorySegment {
  id: string;
  text: string;
  /** The same words with emotion markup, or null for plain delivery. */
  narrationText: string | null;
  narrationUrl: string | null;
  narrationDurationMs: number | null;
  assets: StoryAsset[];
}

export interface StoryChapter {
  id: string;
  title: string | null;
  segments: StorySegment[];
}

export interface Story {
  id: string;
  title: string;
  synopsis: string | null;
  cover: StoryAsset | null;
  chapters: StoryChapter[];
  characters: { id: string; name: string; description: string | null }[];
}

/**
 * A card in the standalone story library. Content-free on purpose — the list
 * shows every published story and none of their text, so the payload carries
 * what a cover needs and nothing else.
 *
 * Unlike a course story, this one is free to any signed-in child: the API lets
 * PUBLISHED through its read gate without an entitlement.
 */
export interface StoryLibraryItem {
  id: string;
  title: string;
  synopsis: string | null;
  gradeBand: string | null;
  coverUrl: string | null;
  pageCount: number;
  narrated: boolean;
}
