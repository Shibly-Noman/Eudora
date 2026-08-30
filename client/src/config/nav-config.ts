import {
  BookHeadphones,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Feather,
  GraduationCap,
  HeartHandshake,
  Home,
  Layers,
  LayoutDashboard,
  Library,
  type LucideIcon,
  MessageSquare,
  NotebookPen,
  PencilRuler,
  Presentation,
  Radio,
  Route,
  School,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCog,
  UserPlus,
  Users2,
  UsersRound,
} from "lucide-react";

import { type AuthUser, hasAccess, type NavRequirement, type PrimaryRole } from "@/lib/access-control";

export interface NavLeaf {
  title: string;
  url: string;
  icon: LucideIcon;
  requirement: NavRequirement;
  /**
   * Per-role wording for the same destination. /gradebook is "Gradebook" to the
   * staff writing marks into it and "Report Card" to the family reading them
   * out — one page, two audiences, and the admin word is the wrong one to show
   * a parent.
   */
  titleByRole?: Partial<Record<PrimaryRole, string>>;
  /**
   * Feature has no backing page/API yet — shown greyed out with a "Soon" badge, not linked. No leaf
   * currently sets this (both no-backing-page cases so far — Diagnostics, Placement — used `hidden`
   * instead, since they had a route worth guarding, just not one worth advertising); kept as the
   * documented mechanism for the next feature that ships UI before its API.
   */
  disabled?: boolean;
  /**
   * Descoped pending redesign: kept in this config (so the route guard still matches the URL and
   * denies it) but never rendered in the sidebar. Removing the entry outright would have the
   * opposite effect — the guard treats unmatched routes as "any authenticated role".
   */
  hidden?: boolean;
  /** Draws a calm pulsing outline (theme-colored) to call attention to this item while inactive. */
  highlight?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavLeaf[];
}

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

/**
 * Where each role lands after login. Never drawn as nav items — the logo and
 * the single "Home" entry cover them — but they MUST stay enumerated here: the
 * route guard in (dashboard)/layout.tsx treats a pathname with no matching leaf
 * as "any authenticated role", so deleting these would open /parent and
 * /teacher to every signed-in user. robots.ts reads the same list to keep them
 * out of the index.
 */
export const portalHomeLeaves: NavLeaf[] = [
  {
    title: "Overview",
    url: "/dashboard",
    icon: LayoutDashboard,
    requirement: { type: "roles", roles: ADMIN_ROLES },
  },
  {
    title: "Parent Portal",
    url: "/parent",
    icon: HeartHandshake,
    // Admins used to see this too via ...ADMIN_ROLES; re-add the spread to restore that.
    requirement: { type: "roles", roles: ["GUARDIAN"] /* , ...ADMIN_ROLES */ },
  },
  {
    title: "Student Portal",
    url: "/student",
    icon: GraduationCap,
    // Admins used to see this too via ...ADMIN_ROLES; re-add the spread to restore that.
    requirement: { type: "roles", roles: ["USER"] /* , ...ADMIN_ROLES */ },
  },
  {
    title: "Teacher Portal",
    url: "/teacher",
    icon: Presentation,
    // Admins used to see this too via ...ADMIN_ROLES; re-add the spread to restore that.
    requirement: { type: "roles", roles: ["TEACHER"] /* , ...ADMIN_ROLES */ },
  },
];

/**
 * One flat list per group — deliberately no sub-menus.
 *
 * Collapsible parents hid ten of an admin's twenty destinations behind a closed
 * chevron on first paint, and hid them outright in icon-rail mode, where
 * SidebarMenuSub carries `group-data-[collapsible=icon]:hidden` and the parent
 * row is therefore a dead click. Groups here are visual separators only; every
 * destination is one click from anywhere.
 */
export const navGroups: NavGroup[] = [
  {
    label: "Teaching",
    items: [
      {
        title: "Live Classes",
        url: "/live-classes",
        icon: Radio,
        requirement: { type: "permission", action: "read", subject: "LiveClass" },
      },
      {
        title: "Attendance",
        url: "/attendance",
        icon: CalendarCheck,
        requirement: { type: "permission", action: "read", subject: "Attendance" },
      },
      {
        title: "Homework",
        url: "/homework",
        icon: NotebookPen,
        requirement: { type: "permission", action: "read", subject: "Homework" },
      },
      {
        // "Report Card" used to sit beside this as a permanently-disabled entry pointing at
        // /report-card, which has no page. The report-card view (GPA, term average, class rank,
        // percentile) is the student/guardian branch of /gradebook — so it is a title, not a route.
        title: "Gradebook",
        url: "/gradebook",
        icon: ClipboardCheck,
        requirement: { type: "permission", action: "read", subject: "Gradebook" },
        titleByRole: { GUARDIAN: "Report Card", STUDENT: "Report Card" },
      },
      {
        title: "Assessments",
        url: "/assessments",
        icon: ClipboardList,
        requirement: { type: "roles", roles: ["TEACHER", ...ADMIN_ROLES] },
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        title: "Courses",
        url: "/courses",
        icon: BookOpen,
        requirement: { type: "roles", roles: ["TEACHER", ...ADMIN_ROLES] },
      },
      {
        // The learner-facing Clio hub, named against "Lesson Builder" below: a teacher holds both,
        // and "Active Learning" said nothing about which one opens the player and which edits it.
        title: "Lesson Library",
        url: "/learning",
        icon: Sparkles,
        requirement: { type: "roles", roles: ["TEACHER", "USER", ...ADMIN_ROLES] },
        highlight: true,
      },
      {
        title: "Lesson Builder",
        url: "/lessons",
        icon: PencilRuler,
        requirement: { type: "roles", roles: ["TEACHER", ...ADMIN_ROLES] },
      },
      {
        // Paired with "Stories" below the way Lesson Library is paired with
        // Lesson Builder: this one reads, that one writes. It is the only entry
        // in this group a family reaches without owning a course, since a
        // published story is free.
        title: "Story Library",
        url: "/story-library",
        icon: BookHeadphones,
        requirement: { type: "roles", roles: ["TEACHER", "USER", "GUARDIAN", ...ADMIN_ROLES] },
      },
      {
        // Sits under Content rather than beside Courses because a story is a
        // thing you write, not a thing you timetable — and, unlike every other
        // entry here, one can be published on its own without belonging to a
        // course at all.
        title: "Stories",
        url: "/stories",
        icon: Feather,
        requirement: { type: "roles", roles: ["TEACHER", ...ADMIN_ROLES] },
      },
      {
        title: "Question Bank",
        url: "/questions",
        icon: Library,
        requirement: { type: "roles", roles: ["TEACHER", ...ADMIN_ROLES] },
      },
      {
        title: "Learning Paths",
        url: "/learning-paths",
        icon: Route,
        requirement: { type: "roles", roles: ["TEACHER", ...ADMIN_ROLES] },
      },
      {
        title: "Diagnostics",
        url: "/diagnostics",
        icon: Stethoscope,
        requirement: { type: "permission", action: "read", subject: "Diagnostic" },
        // Descoped: DiagnosticsService.scheduleDiagnostic() throws NotImplementedException, so the
        // page can only ever list pre-existing seed attempts. Grouped with Placement below for a
        // later design pass.
        hidden: true,
      },
    ],
  },
  {
    label: "Enrolment",
    items: [
      {
        title: "Programs",
        url: "/programs",
        icon: School,
        requirement: { type: "roles", roles: ADMIN_ROLES },
      },
      {
        // The cohort a LIVE course is actually sold as a seat in.
        title: "Batches",
        url: "/batches",
        icon: Layers,
        requirement: { type: "roles", roles: ADMIN_ROLES },
      },
      {
        // The `Class` taxonomy master (Class -> Program -> Course). Titled "Grades" to match the
        // word the public catalog already uses ("Grades 1–2" on /explore). The model stays `Class`
        // in code, where it still collides with the ClassSection surviving behind attendance.
        title: "Grades",
        url: "/grade-levels",
        icon: GraduationCap,
        requirement: { type: "roles", roles: ADMIN_ROLES },
      },
      {
        // Support tooling for access: refunds, comps, and "I paid but I can't see it" tickets all
        // get resolved here.
        title: "Course Access",
        url: "/entitlements",
        icon: ShieldCheck,
        requirement: { type: "roles", roles: ADMIN_ROLES },
      },
      {
        title: "Leads",
        url: "/leads",
        icon: UserPlus,
        requirement: { type: "roles", roles: ADMIN_ROLES },
      },
      {
        // Learning Gaps and Next Actions were removed entirely — nothing ever created a LearningGap
        // row, the detection engine was never built. Placement depends on Diagnostics, which is also
        // unbuilt, so it's descoped the same way: kept here only so the route guard keeps matching
        // its URL and denies it (see the `hidden` doc above) — typing /placement does not reach it.
        title: "Placement",
        url: "/placement",
        icon: Layers,
        requirement: { type: "permission", action: "read", subject: "Placement" },
        hidden: true,
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        title: "Students",
        url: "/students",
        icon: UsersRound,
        requirement: { type: "roles", roles: ADMIN_ROLES },
      },
      {
        title: "Teachers",
        url: "/teachers",
        icon: Users2,
        requirement: { type: "roles", roles: ADMIN_ROLES },
      },
      {
        title: "Users & Roles",
        url: "/users",
        icon: UserCog,
        requirement: { type: "roles", roles: ADMIN_ROLES },
      },
      {
        title: "Announcements",
        url: "/communication",
        icon: MessageSquare,
        requirement: { type: "roles", roles: ADMIN_ROLES },
      },
    ],
  },
];

/**
 * The buy path, surfaced in the family portal header.
 *
 * Deliberately NOT a member of `navGroups`: robots.ts disallows every nav leaf URL, and /explore is
 * the public, indexable catalog the whole acquisition funnel depends on. Guardian-only — the child
 * cannot complete a purchase, so a buy CTA on the student portal would only generate pestering.
 */
export const browseCoursesLink: NavLeaf = {
  title: "Browse Courses",
  url: "/explore",
  icon: Compass,
  requirement: { type: "roles", roles: ["GUARDIAN"] },
};

/** The role's landing page as a single "Home" item, instead of one entry per portal. */
export function homeLeaf(url: string): NavLeaf {
  return { title: "Home", url, icon: Home, requirement: { type: "always" } };
}

/** The wording this role should see for a destination. */
export function navTitle(leaf: NavLeaf, role: PrimaryRole): string {
  return leaf.titleByRole?.[role] ?? leaf.title;
}

/**
 * Every leaf the route guard and robots.txt need to know about: the rendered nav plus the role
 * landing pages that are never drawn as items.
 */
export function flattenNavLeaves(groups: NavGroup[] = navGroups): NavLeaf[] {
  return [...portalHomeLeaves, ...groups.flatMap((group) => group.items)];
}

// Longest-url-first so a more specific route (/users/roles) is matched before
// a shorter sibling prefix (/users).
const leavesByUrlLength = flattenNavLeaves().sort((a, b) => b.url.length - a.url.length);

/** The nav entry governing a path, or undefined when no entry claims it. */
export function resolveNavLeaf(pathname: string): NavLeaf | undefined {
  return leavesByUrlLength.find(
    (leaf) => pathname === leaf.url || pathname.startsWith(`${leaf.url}/`),
  );
}

/**
 * Whether a user may open a dashboard route.
 *
 * Lives here rather than in the layout that calls it so the rule can be tested
 * directly: it decides who reaches which page, and a component-level useMemo is
 * only reachable by rendering the whole shell.
 */
export function isRouteAuthorized(
  pathname: string,
  user: AuthUser | null | undefined,
): boolean {
  const matchedLeaf = resolveNavLeaf(pathname);
  // Routes with no nav entry default to "any authenticated role", same as before.
  if (!matchedLeaf) return true;
  // Hidden (descoped) and disabled (no backing page) leaves stay in the config purely so this
  // guard keeps matching their URL. Neither should be reachable by typing it directly — dropping
  // them from the config instead would fall through to the "any authenticated role" default above.
  if (matchedLeaf.hidden || matchedLeaf.disabled) return false;
  return hasAccess(user, matchedLeaf.requirement);
}
