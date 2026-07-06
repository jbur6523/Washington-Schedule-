export type StaffType = "Full-time" | "Per diem";
export type StaffOperationsRole = "none" | "aide" | "command_center" | "director";
export type UsualShift =
  | "Dayshift"
  | "Nightshift"
  | "Pulm Rehab"
  | "PFT"
  | "Flexible";
export type ScheduleStatus =
  | "Scheduled"
  | "Available"
  | "Coverage Requested"
  | "Short Shift"
  | "Switch Requested"
  | "Wants Off"
  | "Self-added";
export type EmployeeRequestStatus = "Switch Requested" | "Coverage Requested" | "Wants Off";
export type ShiftPostType = EmployeeRequestStatus | "Short Shift";
export type CoverageIntensity = "low" | "medium" | "critical";

export type StaffMember = {
  id: string;
  name: string;
  staffType: StaffType;
  usualShift: UsualShift;
  operationsRole?: StaffOperationsRole;
};

export type ScheduleEntry = {
  id?: string;
  baseScheduleEntryId?: string | null;
  userScheduleOverrideId?: string | null;
  staffProfileId?: string | null;
  shiftDate?: string;
  shiftType?: string;
  shiftStart?: string;
  shiftEnd?: string;
  staffName: string;
  shiftTime: string;
  shiftCategory?: "day" | "night";
  shiftTypeLabel?: string;
  staffType: StaffType;
  operationsRole?: StaffOperationsRole | null;
  status: Extract<ScheduleStatus, "Scheduled" | "Available">;
  selfAdded?: boolean;
  isShiftLead?: boolean;
  statusMessage?: string | null;
  coworkerTitles?: Array<{ title: string; label: string; icon: string }>;
};

export type ShiftPost = {
  id: string;
  day: string;
  shiftTime: string;
  shiftCategory?: "day" | "night";
  shiftTypeLabel?: string;
  postedBy: string;
  staffType: StaffType;
  operationsRole?: StaffOperationsRole | null;
  type: ShiftPostType;
  coverageIntensity: CoverageIntensity;
  status: Extract<ScheduleStatus, "Short Shift" | EmployeeRequestStatus>;
  description: string;
  targetStaffName?: string;
  targetStaffProfileId?: string | null;
  shiftRequestId?: string;
  shiftShortageId?: string;
  scope: "employee" | "shift";
};

export type ScheduleDay = {
  day: string;
  dateValue?: string;
  dateLabel?: string;
  scheduled: ScheduleEntry[];
  available: ScheduleEntry[];
  coverageRequests: ScheduleEntry[];
  shiftPosts: ShiftPost[];
};

const id = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const staff: StaffMember[] = [
  { id: id("Elizabeth Ricker"), name: "Elizabeth Ricker (Beth)", staffType: "Full-time", usualShift: "Pulm Rehab" },
  { id: id("Raul Rodriguez"), name: "Raul Rodriguez", staffType: "Full-time", usualShift: "PFT" },
  { id: id("Anna Vaysburg"), name: "Anna Vaysburg", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Rudy Teodosio"), name: "Rudy Teodosio", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Allan Dale Timbang"), name: "Allan Dale Timbang", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("David Winters"), name: "David Winters", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Emmanuel Rivera"), name: "Emmanuel Rivera", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Sherry Harrington"), name: "Sherry Harrington", staffType: "Full-time", usualShift: "Pulm Rehab" },
  { id: id("Pawanjit Khera"), name: "Pawanjit Khera (Kinty)", staffType: "Full-time", usualShift: "Pulm Rehab" },
  { id: id("Diana Oblitas"), name: "Diana Oblitas", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Heather Heath"), name: "Heather Heath", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Cecilia Martinez"), name: "Cecilia Martinez", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Danielle Rigdon"), name: "Danielle Rigdon", staffType: "Full-time", usualShift: "PFT" },
  { id: id("Tom Nguyen"), name: "Tom Nguyen", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Yiqin Meng"), name: "Yiqin Meng (Maggie)", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Bei Yi"), name: "Bei Yi", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Win Hlaing"), name: "Win Hlaing", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Beletu Shoge"), name: "Beletu Shoge", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Gina Martinez"), name: "Gina Martinez", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Katryna Vuong"), name: "Katryna Vuong", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Jonathan Burdick"), name: "Jonathan Burdick", staffType: "Full-time", usualShift: "Dayshift" },
  { id: id("Joann Devera"), name: "Joann Devera", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Meldy Pak"), name: "Meldy Pak", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Victor Davis"), name: "Victor Davis", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Pablo Baluyut"), name: "Pablo Baluyut", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Jean Rodrillo"), name: "Jean Rodrillo", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("My-Quyen Giang"), name: "My-Quyen Giang", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Anthony Alix"), name: "Anthony Alix", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Renae Waldschmidt"), name: "Renae Waldschmidt", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Carl Lin"), name: "Carl Lin", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Yu Lin"), name: "Yu Lin", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Eduardo Gonzalez"), name: "Eduardo Gonzalez", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Gene Benoza"), name: "Gene Benoza", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Vanessa Osgood"), name: "Vanessa Osgood", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Anthony Lanchinebre"), name: "Anthony Lanchinebre", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Stephanie Ortiz"), name: "Stephanie Ortiz", staffType: "Full-time", usualShift: "Nightshift" },
  { id: id("Mona Ahmed"), name: "Mona Ahmed", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Victoria Mohseni"), name: "Victoria Mohseni", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Leticia Bartolome"), name: "Leticia Bartolome", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Carlos Ruvalcaba"), name: "Carlos Ruvalcaba", staffType: "Per diem", usualShift: "Nightshift" },
  { id: id("Mai Vu"), name: "Mai Vu", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("John Roberts"), name: "John Roberts (Marshall)", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Solyanna Beyene"), name: "Solyanna Beyene", staffType: "Per diem", usualShift: "Nightshift" },
  { id: id("Reggie De Jesus"), name: "Reggie De Jesus", staffType: "Per diem", usualShift: "Nightshift" },
  { id: id("Peter Van Dal"), name: "Peter Van Dal (Pete)", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Aisha Bahrami"), name: "Aisha Bahrami", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Nina Ksovreli"), name: "Nina Ksovreli", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Harjot Kaur"), name: "Harjot Kaur (Joy)", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Kae Alameda"), name: "Kae Alameda", staffType: "Per diem", usualShift: "Nightshift" },
  { id: id("Jemin Perenia"), name: "Jemin Perenia (Aby)", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Andrea Watkins"), name: "Andrea Watkins", staffType: "Per diem", usualShift: "Dayshift" },
  { id: id("Kaitlyn Trivisonno"), name: "Kaitlyn Trivisonno", staffType: "Per diem", usualShift: "Nightshift" },
  { id: id("Leonard Lacap"), name: "Leonard Lacap", staffType: "Per diem", usualShift: "Flexible" },
  { id: id("Joshua Horng"), name: "Joshua Horng", staffType: "Per diem", usualShift: "Flexible" },
  { id: id("Erica Collins"), name: "Erica Collins", staffType: "Per diem", usualShift: "Nightshift" },
  { id: id("Catherine Morgan"), name: "Catherine Morgan", staffType: "Per diem", usualShift: "Nightshift" },
  { id: id("Tom Macasaet"), name: "Tom Macasaet", staffType: "Per diem", usualShift: "Dayshift" }
];

export const fallbackSchedule: ScheduleDay[] = [
  {
    day: "Monday",
    scheduled: [
      { staffName: "Jonathan Burdick", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Anna Vaysburg", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Tom Nguyen", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Joann Devera", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Meldy Pak", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Victor Davis", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" }
    ],
    available: [
      { staffName: "Mona Ahmed", shiftTime: "06:30-19:00", staffType: "Per diem", status: "Available" },
      { staffName: "Peter Van Dal (Pete)", shiftTime: "06:30-19:00", staffType: "Per diem", status: "Available" },
      { staffName: "Reggie De Jesus", shiftTime: "18:30-07:00", staffType: "Per diem", status: "Available" }
    ],
    coverageRequests: [
      { staffName: "Tom Nguyen", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" }
    ],
    shiftPosts: [
      {
        id: "monday-tom-switch",
        day: "Monday",
        shiftTime: "06:30-19:00",
        postedBy: "Tom Nguyen",
        staffType: "Full-time",
        type: "Switch Requested",
        coverageIntensity: "low",
        status: "Switch Requested",
        description: "Open to switching this scheduled shift.",
        targetStaffName: "Tom Nguyen",
        scope: "employee"
      },
      {
        id: "monday-tom-coverage",
        day: "Monday",
        shiftTime: "06:30-19:00",
        postedBy: "Tom Nguyen",
        staffType: "Full-time",
        type: "Coverage Requested",
        coverageIntensity: "low",
        status: "Coverage Requested",
        description: "Coverage requested for this shift.",
        targetStaffName: "Tom Nguyen",
        scope: "employee"
      },
      {
        id: "monday-night-short",
        day: "Monday",
        shiftTime: "18:30-07:00",
        postedBy: "Nightshift Team",
        staffType: "Full-time",
        type: "Short Shift",
        coverageIntensity: "medium",
        status: "Short Shift",
        description: "One short assignment available tonight.",
        scope: "shift"
      }
    ]
  },
  {
    day: "Tuesday",
    scheduled: [
      { staffName: "Heather Heath", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Cecilia Martinez", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Gina Martinez", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Pablo Baluyut", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Jean Rodrillo", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Renae Waldschmidt", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" }
    ],
    available: [
      { staffName: "Leticia Bartolome", shiftTime: "06:30-19:00", staffType: "Per diem", status: "Available" },
      { staffName: "Aisha Bahrami", shiftTime: "06:30-19:00", staffType: "Per diem", status: "Available" },
      { staffName: "Kae Alameda", shiftTime: "18:30-07:00", staffType: "Per diem", status: "Available" },
      { staffName: "Catherine Morgan", shiftTime: "18:30-07:00", staffType: "Per diem", status: "Available" }
    ],
    coverageRequests: [
      { staffName: "Jean Rodrillo", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" }
    ],
    shiftPosts: [
      {
        id: "tuesday-jean-asap",
        day: "Tuesday",
        shiftTime: "18:30-07:00",
        postedBy: "Jean Rodrillo",
        staffType: "Full-time",
        type: "Coverage Requested",
        coverageIntensity: "critical",
        status: "Coverage Requested",
        description: "Coverage requested for this shift.",
        targetStaffName: "Jean Rodrillo",
        scope: "employee"
      },
      {
        id: "tuesday-dayshift-pickup",
        day: "Tuesday",
        shiftTime: "06:30-19:00",
        postedBy: "Dayshift Team",
        staffType: "Per diem",
        type: "Short Shift",
        coverageIntensity: "medium",
        status: "Short Shift",
        description: "One short assignment available dayshift.",
        scope: "shift"
      }
    ]
  },
  {
    day: "Wednesday",
    scheduled: [
      { staffName: "Diana Oblitas", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "David Winters", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Katryna Vuong", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Carl Lin", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Yu Lin", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Eduardo Gonzalez", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" }
    ],
    available: [
      { staffName: "Victoria Mohseni", shiftTime: "06:30-19:00", staffType: "Per diem", status: "Available" },
      { staffName: "Harjot Kaur (Joy)", shiftTime: "06:30-19:00", staffType: "Per diem", status: "Available" },
      { staffName: "Kaitlyn Trivisonno", shiftTime: "18:30-07:00", staffType: "Per diem", status: "Available" },
      { staffName: "Erica Collins", shiftTime: "18:30-07:00", staffType: "Per diem", status: "Available" }
    ],
    coverageRequests: [
      { staffName: "Katryna Vuong", shiftTime: "06:30-19:00", staffType: "Full-time", status: "Scheduled" },
      { staffName: "Carl Lin", shiftTime: "18:30-07:00", staffType: "Full-time", status: "Scheduled" }
    ],
    shiftPosts: [
      {
        id: "wednesday-katryna-switch",
        day: "Wednesday",
        shiftTime: "06:30-19:00",
        postedBy: "Katryna Vuong",
        staffType: "Full-time",
        type: "Switch Requested",
        coverageIntensity: "low",
        status: "Switch Requested",
        description: "Open to switching this scheduled shift.",
        targetStaffName: "Katryna Vuong",
        scope: "employee"
      },
      {
        id: "wednesday-carl-cover",
        day: "Wednesday",
        shiftTime: "18:30-07:00",
        postedBy: "Carl Lin",
        staffType: "Full-time",
        type: "Coverage Requested",
        coverageIntensity: "medium",
        status: "Coverage Requested",
        description: "Coverage help requested for this shift.",
        targetStaffName: "Carl Lin",
        scope: "employee"
      },
      {
        id: "wednesday-night-urgent",
        day: "Wednesday",
        shiftTime: "18:30-07:00",
        postedBy: "Nightshift Team",
        staffType: "Per diem",
        type: "Short Shift",
        coverageIntensity: "critical",
        status: "Short Shift",
        description: "Urgently short one RT tonight.",
        scope: "shift"
      }
    ]
  }
];

export const allShiftPosts = fallbackSchedule.flatMap((day) => day.shiftPosts);

export const findStaff = (name: string) =>
  staff.find((member) => member.name === name || member.name.includes(name) || name.includes(member.name));

export const getStaffSummary = (name: string) => {
  const scheduled = fallbackSchedule.reduce(
    (count, day) => count + day.scheduled.filter((entry) => entry.staffName === name).length,
    0
  );
  const available = fallbackSchedule.reduce(
    (count, day) => count + day.available.filter((entry) => entry.staffName === name).length,
    0
  );
  const coverageRequests = fallbackSchedule.reduce(
    (count, day) => count + day.coverageRequests.filter((entry) => entry.staffName === name).length,
    0
  );

  return { scheduled, available, coverageRequests };
};
