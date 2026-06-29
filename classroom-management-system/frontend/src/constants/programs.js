// Programs offered, grouped by school.
// Each program's school is looked up automatically via getSchoolForProgram().

export const SCHOOLS = {
  "Information Communication Technology (ICT)": [
    "Bachelor of Cyber Security",
    "Bachelor of Software Engineering",
    "Bachelor of Information Technology",
    "Diploma in Information and Technology",
    "Computer Hardware & Repair",
    "CCTV Surveillance & Maintenance",
  ],
  Engineering: [
    "Bachelor of Engineering in Electrical & Electronics (Power)",
    "Bachelor of Engineering in Instrumentation",
    "Bachelor of Engineering in Telecommunication & Electronics",
    "Diploma in Electrical & Electronics",
    "Armature Winding",
    "Domestic Household Wiring",
    "Solar Installation & Maintenance",
  ],
  Business: [
    "Bachelor of Business Administration",
    "Bachelor of Accountancy",
    "Bachelor of Science in Marketing",
    "Bachelor of Purchasing & Supply Chain Management",
    "Diploma in Accounting and Business",
  ],
  Education: ["Bachelor of ICT with Education"],
};

export const ALL_PROGRAMS = Object.values(SCHOOLS).flat();

export function getSchoolForProgram(program) {
  for (const [school, programs] of Object.entries(SCHOOLS)) {
    if (programs.includes(program)) return school;
  }
  return "Unassigned";
}
