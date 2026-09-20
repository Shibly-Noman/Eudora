import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL ?? '';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...');

  // ─── Permissions & Roles ─────────────────────────────────────────────────────
  const subjects = ['User', 'Role', 'Permission', 'Teacher', 'Student', 'Assessment', 'Attendance', 'Homework', 'Gradebook', 'ReportCard', 'LearningGap', 'NextAction', 'Diagnostic', 'Placement', 'LiveClass'];
  const actions = ['create', 'read', 'update', 'delete', 'manage', 'attempt', 'mark', 'assign'];
  const permissionIds: Record<string, string> = {};

  for (const subject of subjects) {
    for (const action of actions) {
      const permission = await prisma.permission.upsert({
        where: { action_subject: { action, subject } },
        update: {},
        create: { action, subject, description: `Can ${action} ${subject}s` },
      });
      permissionIds[`${action}:${subject}`] = permission.id;
    }
  }
  console.log('✅ Created permissions');

  const superAdminRole = await prisma.role.upsert({ where: { name: 'SUPER_ADMIN' }, update: {}, create: { name: 'SUPER_ADMIN', description: 'Super administrator with all permissions' } });
  const adminRole = await prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN', description: 'Administrator with management permissions' } });
  const userRole = await prisma.role.upsert({ where: { name: 'USER' }, update: {}, create: { name: 'USER', description: 'Regular user with profile-only access' } });
  const guardianRole = await prisma.role.upsert({ where: { name: 'GUARDIAN' }, update: {}, create: { name: 'GUARDIAN', description: 'Guardian with read-only dashboard access to their linked students' } });
  const teacherRole = await prisma.role.upsert({ where: { name: 'TEACHER' }, update: {}, create: { name: 'TEACHER', description: 'Teacher with class management and assessment scoring permissions' } });
  console.log('✅ Created roles');

  for (const permissionId of Object.values(permissionIds)) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId },
    });
  }

  const adminPerms = [
    'create:User','read:User','update:User','delete:User','create:Role','read:Role','update:Role','delete:Role',
    'read:Permission','create:Teacher','read:Teacher','update:Teacher','delete:Teacher','manage:Teacher',
    'create:Student','read:Student','update:Student','delete:Student','manage:Student',
    'read:Assessment','manage:Assessment','assign:Assessment',
    'create:Attendance','read:Attendance','update:Attendance','delete:Attendance','manage:Attendance',
    'create:Homework','read:Homework','update:Homework','delete:Homework','manage:Homework',
    'create:Gradebook','read:Gradebook','update:Gradebook','delete:Gradebook','manage:Gradebook',
    'create:ReportCard','read:ReportCard','update:ReportCard','delete:ReportCard','manage:ReportCard',
    'create:LearningGap','read:LearningGap','update:LearningGap','delete:LearningGap','manage:LearningGap',
    'create:NextAction','read:NextAction','update:NextAction','delete:NextAction','manage:NextAction',
    'create:Diagnostic','read:Diagnostic','update:Diagnostic','delete:Diagnostic','manage:Diagnostic',
    'create:Placement','read:Placement','update:Placement','delete:Placement','manage:Placement',
    'create:LiveClass','read:LiveClass','update:LiveClass','delete:LiveClass','manage:LiveClass',
  ];
  for (const k of adminPerms) {
    const pid = permissionIds[k];
    if (pid) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: adminRole.id, permissionId: pid } }, update: {}, create: { roleId: adminRole.id, permissionId: pid } });
  }
  for (const k of ['read:User','read:Student','read:Assessment','attempt:Assessment','read:Attendance','read:Homework','attempt:Homework','read:Gradebook','read:ReportCard']) {
    const pid = permissionIds[k];
    if (pid) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: userRole.id, permissionId: pid } }, update: {}, create: { roleId: userRole.id, permissionId: pid } });
  }
  for (const k of ['read:User','read:Teacher','read:Student','update:Student','manage:Student','read:Assessment','attempt:Assessment','mark:Assessment','assign:Assessment','create:Attendance','read:Attendance','update:Attendance','manage:Attendance','create:Homework','read:Homework','update:Homework','delete:Homework','manage:Homework','create:Gradebook','read:Gradebook','update:Gradebook','manage:Gradebook','read:LearningGap','update:LearningGap','create:NextAction','read:NextAction','update:NextAction','create:Diagnostic','read:Diagnostic','update:Diagnostic','create:Placement','read:Placement','update:Placement','create:LiveClass','read:LiveClass','update:LiveClass']) {
    const pid = permissionIds[k];
    if (pid) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: teacherRole.id, permissionId: pid } }, update: {}, create: { roleId: teacherRole.id, permissionId: pid } });
  }
  // read:Gradebook is what actually unlocks the report card for guardians: the "Report Card &
  // Academic Ledger" view (GPA, term average, class rank, percentile) is the guardian branch of
  // /gradebook, and both gradebook student endpoints require read:Gradebook. Without it a guardian
  // held read:ReportCard while the only page serving it returned Access Denied.
  // attempt:Homework is a *write* in a list that is otherwise all reads, and it
  // is deliberate: a child created through the family portal has no password
  // and cannot sign in, so the guardian hands work in on their behalf. Without
  // it the submit route passes @Roles('GUARDIAN') and is then refused by the
  // permissions guard, which is a 403 nobody can explain from the outside.
  for (const k of ['read:User','read:Student','read:Timetable','read:Attendance','read:Homework','attempt:Homework','read:ReportCard','read:Gradebook']) {
    const pid = permissionIds[k];
    if (pid) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: guardianRole.id, permissionId: pid } }, update: {}, create: { roleId: guardianRole.id, permissionId: pid } });
  }
  console.log('✅ Assigned permissions to roles');

  // ─── Super Admin User ─────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('Admin@123', 10);
  const superAdminUser = await prisma.user.upsert({
    where: { email: 'admin@eudora.app' },
    update: { password: hashedPassword },
    create: { email: 'admin@eudora.app', password: hashedPassword, firstName: 'System', lastName: 'Admin', isActive: true },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdminUser.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: superAdminUser.id, roleId: superAdminRole.id },
  });
  console.log('✅ Created super-admin user');

  // ─── Institution & Academic Structure ────────────────────────────────────────
  console.log('🌱 Seeding institution and academic structures...');
  // ─── Classes ────────────────────────────────────────────────────────────────
  // Classes are the taxonomy master (Class -> Program -> Course). These rows
  // were the old `Level` lookup, which only ever held grade levels. Seeded
  // before Programs because Program.classId points at them.
  const gradeLevel = await prisma.class.upsert({ where: { code: 'G2' }, update: {}, create: { code: 'G2', name: 'Grade 2', slug: 'grade-2', sortOrder: 2, status: 'PUBLISHED' } });
  const kLevel = await prisma.class.upsert({ where: { code: 'K' }, update: {}, create: { code: 'K', name: 'Kindergarten', slug: 'kindergarten', sortOrder: 0, status: 'PUBLISHED' } });
  const g1Level = await prisma.class.upsert({ where: { code: 'G1' }, update: {}, create: { code: 'G1', name: 'Grade 1', slug: 'grade-1', sortOrder: 1, status: 'PUBLISHED' } });
  const g3Level = await prisma.class.upsert({ where: { code: 'G3' }, update: {}, create: { code: 'G3', name: 'Grade 3', slug: 'grade-3', sortOrder: 3, status: 'PUBLISHED' } });
  const g5Level = await prisma.class.upsert({ where: { code: 'G5' }, update: {}, create: { code: 'G5', name: 'Grade 5', slug: 'grade-5', sortOrder: 5, status: 'PUBLISHED' } });

  // Demo SKU pricing: $100 one-time, or 3 monthly installments. The even split
  // leaves a 1-cent remainder that the final installment absorbs at checkout —
  // 3333 + 3333 + 3334 = 10000.
  // `update` mirrors `create` for the taxonomy/pricing fields so re-seeding an
  // existing database converges on the demo SKU instead of leaving pre-migration
  // rows priceless and defaulted.
  const csProgramFields = {
    classId: gradeLevel.id,
    status: 'PUBLISHED' as const,
    deliveryMode: 'LIVE' as const,
    durationMonths: 3,
    priceOneTimeCents: 10000,
    priceMonthlyCents: 3333,
    installmentCount: 3,
  };

  const program = await prisma.program.upsert({
    where: { code: 'KIDS-EY' },
    update: csProgramFields,
    create: {
      name: 'Early Years Foundation',
      code: 'KIDS-EY',
      slug: 'early-years-foundation',
      classId: gradeLevel.id,
      shortDescription: 'Phonics, counting and shapes for pre-school and reception.',
      status: 'PUBLISHED',
      deliveryMode: 'LIVE',
      durationMonths: 3,
      priceOneTimeCents: 10000,
      priceMonthlyCents: 3333,
      installmentCount: 3,
    },
  });

  const mathProgram = await prisma.program.upsert({
    where: { code: 'KIDS-MATH' },
    update: csProgramFields,
    create: {
      name: 'Primary Maths Pathway',
      code: 'KIDS-MATH',
      slug: 'primary-maths-pathway',
      classId: gradeLevel.id,
      shortDescription: 'Number sense through fractions, for Grades 1 to 6.',
      status: 'PUBLISHED',
      deliveryMode: 'LIVE',
      durationMonths: 3,
      priceOneTimeCents: 10000,
      priceMonthlyCents: 3333,
      installmentCount: 3,
    },
  });

  const academicYear = await prisma.academicYear.upsert({
    where: { name: 'Academic Year 2026-2027' },
    update: {},
    create: { name: 'Academic Year 2026-2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-06-30'), status: 'ACTIVE' },
  });

  let term = await prisma.term.findFirst({ where: { name: 'Fall Semester 2026', academicYearId: academicYear.id } });
  if (!term) {
    term = await prisma.term.create({ data: { academicYearId: academicYear.id, name: 'Fall Semester 2026', startDate: new Date('2026-09-10'), endDate: new Date('2026-12-20'), status: 'ACTIVE' } });
  }

  let springTerm = await prisma.term.findFirst({ where: { name: 'Spring Semester 2027', academicYearId: academicYear.id } });
  if (!springTerm) {
    springTerm = await prisma.term.create({ data: { academicYearId: academicYear.id, name: 'Spring Semester 2027', startDate: new Date('2027-01-15'), endDate: new Date('2027-05-30'), status: 'ACTIVE' } });
  }

  // Class sections
  const sectionA = await prisma.classSection.upsert({
    where: { code: 'G2-AM-2026' },
    update: {},
    create: { programId: program.id, academicYearId: academicYear.id, name: 'Grade 2 Morning Group', code: 'G2-AM-2026', class: 'Grade 2', classroom: 'Room A', status: 'ACTIVE' },
  });

  const sectionB = await prisma.classSection.upsert({
    where: { code: 'G2-PM-2026' },
    update: {},
    create: { programId: program.id, academicYearId: academicYear.id, name: 'Grade 2 Afternoon Group', code: 'G2-PM-2026', class: 'Grade 2', classroom: 'Room B', status: 'ACTIVE' },
  });

  const mathSection = await prisma.classSection.upsert({
    where: { code: 'G4-MATH-2026' },
    update: {},
    create: { programId: mathProgram.id, academicYearId: academicYear.id, name: 'Grade 4 Maths Group', code: 'G4-MATH-2026', class: 'Grade 4', classroom: 'Room C', status: 'ACTIVE' },
  });

  // ─── Subjects & Levels ───────────────────────────────────────────────────────
  const mathSubject = await prisma.subject.upsert({ where: { code: 'MATH' }, update: {}, create: { code: 'MATH', name: 'Mathematics' } });
  const sciSubject = await prisma.subject.upsert({ where: { code: 'SCI' }, update: {}, create: { code: 'SCI', name: 'Science' } });
  const engSubject = await prisma.subject.upsert({ where: { code: 'ENG' }, update: {}, create: { code: 'ENG', name: 'English' } });


  // ─── Course Classes ───────────────────────────────────────────────────────────
  const dsaClass = await prisma.batch.upsert({ where: { code: 'G34-MATH-2026' }, update: {}, create: { termId: term.id, name: 'Multiplication & Fractions', code: 'G34-MATH-2026', status: 'ACTIVE' } });
  const algClass = await prisma.batch.upsert({ where: { code: 'G12-MATH-2026' }, update: {}, create: { termId: term.id, name: 'Adding & Subtracting', code: 'G12-MATH-2026', status: 'ACTIVE' } });
  const webClass = await prisma.batch.upsert({ where: { code: 'G34-SCI-2026' }, update: {}, create: { termId: term.id, name: 'Shapes & Measuring', code: 'G34-SCI-2026', status: 'ACTIVE' } });
  const calcClass = await prisma.batch.upsert({ where: { code: 'G56-MATH-2026' }, update: {}, create: { termId: term.id, name: 'Fractions & Early Algebra', code: 'G56-MATH-2026', status: 'ACTIVE' } });
  const engClass = await prisma.batch.upsert({ where: { code: 'G12-READ-2026' }, update: {}, create: { termId: term.id, name: 'Reading & Sentences', code: 'G12-READ-2026', status: 'ACTIVE' } });

  console.log('✅ Seeded institution & academic structures');

  // ─── Teachers ─────────────────────────────────────────────────────────────────
  console.log('🌱 Seeding teachers...');
  const teacherPassword = await bcrypt.hash('Teacher@123', 10);
  const teacherData = [
    { email: 'sarah.mitchell@eudora.app', firstName: 'Sarah', lastName: 'Mitchell', specialization: 'Early Years', employeeCode: 'EMP-MITCHELL', phone: '(555) 100-0001' },
    { email: 'amara.okafor@eudora.app', firstName: 'Amara', lastName: 'Okafor', specialization: 'Primary Maths', employeeCode: 'EMP-OKAFOR', phone: '(555) 100-0002' },
    { email: 'luis.dasilva@eudora.app', firstName: 'Luis', lastName: 'da Silva', specialization: 'Reading and Phonics', employeeCode: 'EMP-DASILVA', phone: '(555) 100-0003' },
    { email: 'mai.nguyen@eudora.app', firstName: 'Mai', lastName: 'Nguyen', specialization: 'Primary Maths', employeeCode: 'EMP-NGUYEN', phone: '(555) 100-0004' },
  ];

  const teacherProfiles: Record<string, any> = {};
  const teacherUsers: Record<string, any> = {};

  for (const t of teacherData) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: { email: t.email, password: teacherPassword, firstName: t.firstName, lastName: t.lastName, isActive: true },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: teacherRole.id } },
      update: {},
      create: { userId: user.id, roleId: teacherRole.id },
    });
    const profile = await prisma.teacherProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, fullName: `${t.firstName} ${t.lastName}`, employeeCode: t.employeeCode, specialization: t.specialization, phone: t.phone, status: 'ACTIVE' },
    });
    teacherProfiles[t.employeeCode] = profile;
    teacherUsers[t.employeeCode] = user;
  }

  // Assign teachers to class sections
  const classSectionAssignments = [
    { teacherCode: 'EMP-MITCHELL', classSectionId: sectionA.id, role: 'PRIMARY' },
    { teacherCode: 'EMP-OKAFOR', classSectionId: sectionA.id, role: 'ASSISTANT' },
    { teacherCode: 'EMP-DASILVA', classSectionId: sectionB.id, role: 'PRIMARY' },
    { teacherCode: 'EMP-NGUYEN', classSectionId: mathSection.id, role: 'PRIMARY' },
  ];
  for (const a of classSectionAssignments) {
    await prisma.classTeacher.upsert({
      where: { teacherProfileId_classSectionId: { teacherProfileId: teacherProfiles[a.teacherCode].id, classSectionId: a.classSectionId } },
      update: {},
      create: { teacherProfileId: teacherProfiles[a.teacherCode].id, classSectionId: a.classSectionId, role: a.role },
    });
  }
  console.log('✅ Seeded teachers');

  // ─── Concepts, Lessons ────────────────────────────────────────────────────────
  console.log('🌱 Seeding curriculum...');

  const fractionsConc = await prisma.concept.upsert({ where: { name: 'Fractions' }, update: {}, create: { name: 'Fractions', description: 'Understanding fraction concepts, operations, and applications' } });
  const algebraConc = await prisma.concept.upsert({ where: { name: 'Algebra Fundamentals' }, update: {}, create: { name: 'Algebra Fundamentals', description: 'Basic algebraic thinking and expressions' } });
  const sortingConc = await prisma.concept.upsert({ where: { name: 'Sorting & Patterns' }, update: {}, create: { name: 'Sorting & Patterns', description: 'Putting things in order by size or number, and spotting what comes next' } });

  // Lessons
  let lesson1 = await prisma.lesson.findFirst({ where: { title: 'Intro to Comparing Fractions' } });
  if (!lesson1) {
    lesson1 = await prisma.lesson.create({ data: { conceptId: fractionsConc.id, title: 'Intro to Comparing Fractions', description: 'Visualizing and understanding how different fractions compare.', sortOrder: 1, xpReward: 50 } });
    const q1 = await prisma.question.create({ data: { subjectId: mathSubject.id, classId: gradeLevel.id, questionType: 'interactive', prompt: 'Slide the dial to increase the numerator and see how the shaded area changes.', correctAnswer: '5', widgetType: 'SLIDER_MANIPULATIVE', isGraded: false, explanation: 'As the numerator increases, you shade more parts of the whole.', hints: ['Try moving the slider all the way to 5 parts.'], widgetConfig: { min: 1, max: 10, step: 1, defaultValue: 2, targetValue: 5, tolerance: 0.1, displayFormula: '{val} / 10', visualizationType: 'scale_balance' } } });
    await prisma.card.create({ data: { lessonId: lesson1.id, title: 'Shading the Whole', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Fractions represent parts of a whole. Let us visualize $$\\frac{x}{10}$$ dynamically.', questionId: q1.id } });
    const q2 = await prisma.question.create({ data: { subjectId: mathSubject.id, classId: gradeLevel.id, questionType: 'mcq', prompt: 'Which fraction is larger: $$\\frac{3}{5}$$ or $$\\frac{3}{7}$$?', correctAnswer: null, widgetType: 'STANDARD_MCQ', isGraded: true, explanation: 'When numerators are equal, the fraction with the smaller denominator is larger.', hints: ['Think about sharing a pizza with 5 people versus 7 people.'] } });
    await prisma.questionOption.create({ data: { questionId: q2.id, optionLabel: 'A', optionText: '$$\\frac{3}{5}$$', isCorrect: true } });
    await prisma.questionOption.create({ data: { questionId: q2.id, optionLabel: 'B', optionText: '$$\\frac{3}{7}$$', isCorrect: false } });
    await prisma.card.create({ data: { lessonId: lesson1.id, title: 'Comparing Equal Numerators', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Now compare two fractions with the same numerator but different denominators.', questionId: q2.id } });
  }

  let lesson2 = await prisma.lesson.findFirst({ where: { title: 'Adding Fractions with Like Denominators' } });
  if (!lesson2) {
    lesson2 = await prisma.lesson.create({ data: { conceptId: fractionsConc.id, title: 'Adding Fractions with Like Denominators', description: 'Learn to add fractions that share a common denominator.', sortOrder: 2, xpReward: 60 } });
    const q3 = await prisma.question.create({ data: { subjectId: mathSubject.id, classId: gradeLevel.id, questionType: 'mcq', prompt: 'What is $$\\frac{2}{7} + \\frac{3}{7}$$?', correctAnswer: null, widgetType: 'STANDARD_MCQ', isGraded: true, explanation: 'Add the numerators and keep the denominator the same.', hints: ['Keep the denominator. Add the numerators.'] } });
    await prisma.questionOption.create({ data: { questionId: q3.id, optionLabel: 'A', optionText: '$$\\frac{5}{7}$$', isCorrect: true } });
    await prisma.questionOption.create({ data: { questionId: q3.id, optionLabel: 'B', optionText: '$$\\frac{5}{14}$$', isCorrect: false } });
    await prisma.questionOption.create({ data: { questionId: q3.id, optionLabel: 'C', optionText: '$$\\frac{6}{7}$$', isCorrect: false } });
    await prisma.card.create({ data: { lessonId: lesson2.id, title: 'Same Bottom, Add the Top', sortOrder: 1, cardType: 'INTERACTIVE', content: 'When denominators match, we simply add the numerators.', questionId: q3.id } });
  }

  let lesson3 = await prisma.lesson.findFirst({ where: { title: 'Variables and Expressions' } });
  if (!lesson3) {
    lesson3 = await prisma.lesson.create({ data: { conceptId: algebraConc.id, title: 'Variables and Expressions', description: 'Introduction to algebraic variables and forming expressions.', sortOrder: 1, xpReward: 55 } });
    const q4 = await prisma.question.create({ data: { subjectId: mathSubject.id, classId: gradeLevel.id, questionType: 'mcq', prompt: 'If x = 4, what is the value of 3x + 2?', correctAnswer: null, widgetType: 'STANDARD_MCQ', isGraded: true, explanation: 'Substitute x = 4: 3(4) + 2 = 12 + 2 = 14.', hints: ['Replace x with 4.'] } });
    await prisma.questionOption.create({ data: { questionId: q4.id, optionLabel: 'A', optionText: '14', isCorrect: true } });
    await prisma.questionOption.create({ data: { questionId: q4.id, optionLabel: 'B', optionText: '12', isCorrect: false } });
    await prisma.questionOption.create({ data: { questionId: q4.id, optionLabel: 'C', optionText: '9', isCorrect: false } });
    await prisma.card.create({ data: { lessonId: lesson3.id, title: 'Substituting Values', sortOrder: 1, cardType: 'INTERACTIVE', content: 'A variable is a symbol that stands for a number. Let\'s practice substitution.', questionId: q4.id } });
  }

  let lesson4 = await prisma.lesson.findFirst({ where: { title: 'Putting Things in Order' } });
  if (!lesson4) {
    lesson4 = await prisma.lesson.create({ data: { conceptId: sortingConc.id, title: 'Putting Things in Order', description: 'Sort numbers from smallest to largest and spot what comes next.', sortOrder: 1, xpReward: 75 } });
    const q5 = await prisma.question.create({ data: { subjectId: mathSubject.id, classId: gradeLevel.id, questionType: 'mcq', prompt: 'Which row is in order from smallest to largest?', correctAnswer: null, widgetType: 'STANDARD_MCQ', isGraded: true, explanation: 'Start with the smallest number and check that each one after it is bigger.', hints: ['Find the smallest number first. Does it come first?'] } });
    await prisma.questionOption.create({ data: { questionId: q5.id, optionLabel: 'A', optionText: '2, 5, 9', isCorrect: true } });
    await prisma.questionOption.create({ data: { questionId: q5.id, optionLabel: 'B', optionText: '9, 2, 5', isCorrect: false } });
    await prisma.questionOption.create({ data: { questionId: q5.id, optionLabel: 'C', optionText: '5, 9, 2', isCorrect: false } });
    await prisma.card.create({ data: { lessonId: lesson4.id, title: 'Smallest to Largest', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'To put numbers in order, look for the smallest one and write it first. Then find the next smallest, and keep going.' } });
    await prisma.card.create({ data: { lessonId: lesson4.id, title: 'Your Turn', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Look at each row and pick the one that goes from smallest to largest.', questionId: q5.id } });
  }

  console.log('✅ Seeded curriculum');

  // ─── Assessment Types ─────────────────────────────────────────────────────────
  console.log('🌱 Seeding assessment types & assessments...');
  const quizType = await prisma.assessmentType.upsert({ where: { code: 'QUIZ' }, update: {}, create: { code: 'QUIZ', name: 'Quiz' } });
  const midtermType = await prisma.assessmentType.upsert({ where: { code: 'MIDTERM' }, update: {}, create: { code: 'MIDTERM', name: 'Midterm Exam' } });
  const finalType = await prisma.assessmentType.upsert({ where: { code: 'FINAL' }, update: {}, create: { code: 'FINAL', name: 'Final Exam' } });
  const hwType = await prisma.assessmentType.upsert({ where: { code: 'HW' }, update: {}, create: { code: 'HW', name: 'Homework Assessment' } });
  await prisma.assessmentType.upsert({ where: { code: 'DIAGNOSTIC' }, update: {}, create: { code: 'DIAGNOSTIC', name: 'Diagnostic Assessment' } });

  // Questions for assessments
  const makeQ = async (subjectId: string, classId: string, prompt: string, options: { label: string; text: string; correct: boolean }[], explanation: string, promptImageUrl?: string) => {
    const existing = await prisma.question.findFirst({ where: { prompt } });
    if (existing) return existing;
    const q = await prisma.question.create({ data: { subjectId, classId, questionType: 'mcq', prompt, promptImageUrl: promptImageUrl ?? null, widgetType: 'STANDARD_MCQ', isGraded: true, explanation, hints: [] } });
    for (const o of options) {
      await prisma.questionOption.create({ data: { questionId: q.id, optionLabel: o.label, optionText: o.text, isCorrect: o.correct } });
    }
    return q;
  };

  const mathQ1 = await makeQ(mathSubject.id, gradeLevel.id, 'Solve: 2x + 6 = 14. What is x?', [{ label: 'A', text: '4', correct: true }, { label: 'B', text: '3', correct: false }, { label: 'C', text: '10', correct: false }, { label: 'D', text: '5', correct: false }], 'Subtract 6 from both sides: 2x = 8. Divide by 2: x = 4.');
  const mathQ2 = await makeQ(mathSubject.id, gradeLevel.id, 'Which of these is equivalent to $$\\frac{4}{6}$$?', [{ label: 'A', text: '$$\\frac{2}{3}$$', correct: true }, { label: 'B', text: '$$\\frac{3}{4}$$', correct: false }, { label: 'C', text: '$$\\frac{1}{2}$$', correct: false }], 'Divide numerator and denominator by 2: 4÷2 / 6÷2 = 2/3.');
  const mathQ3 = await makeQ(mathSubject.id, gradeLevel.id, 'What is 15% of 200?', [{ label: 'A', text: '30', correct: true }, { label: 'B', text: '25', correct: false }, { label: 'C', text: '40', correct: false }], '15% × 200 = 0.15 × 200 = 30.');
  const sciQ1 = await makeQ(sciSubject.id, gradeLevel.id, 'Which shape has exactly three sides?', [{ label: 'A', text: 'Triangle', correct: true }, { label: 'B', text: 'Square', correct: false }, { label: 'C', text: 'Circle', correct: false }], 'A triangle has three straight sides and three corners.');
  const sciQ2 = await makeQ(sciSubject.id, gradeLevel.id, 'How many corners does a square have?', [{ label: 'A', text: '4', correct: true }, { label: 'B', text: '3', correct: false }, { label: 'C', text: '6', correct: false }], 'A square has four equal sides and four corners.');
  const sciQ3 = await makeQ(sciSubject.id, gradeLevel.id, 'Which unit would you use to measure the length of your desk?', [{ label: 'A', text: 'Centimetres', correct: true }, { label: 'B', text: 'Litres', correct: false }, { label: 'C', text: 'Grams', correct: false }], 'Length is measured in centimetres and metres. Litres measure liquid and grams measure weight.');

  // Create assessments
  const createAssessment = async (typeId: string, subjectId: string, classId: string, tId: string, title: string, totalMarks: number, status: string, weekNumber: number | null) => {
    const existing = await prisma.assessment.findFirst({ where: { title } });
    if (existing) {
      const existingSection = await prisma.assessmentSection.findFirstOrThrow({ where: { assessmentId: existing.id } });
      return { assessment: existing, section: existingSection };
    }
    const a = await prisma.assessment.create({
      data: { assessmentTypeId: typeId, subjectId, classId, termId: tId, title, totalMarks, estimatedDurationMinutes: 30, status, weekNumber, publishedAt: status === 'published' ? new Date() : null },
    });
    const section = await prisma.assessmentSection.create({ data: { assessmentId: a.id, title: 'Section 1', sortOrder: 1 } });
    return { assessment: a, section };
  };

  const { assessment: mathQuiz1, section: mathQ1Section } = await createAssessment(quizType.id, mathSubject.id, gradeLevel.id, term.id, 'Week 1 Math Quiz — Fractions', 30, 'published', 1);
  await prisma.assessmentQuestion.upsert({ where: { assessmentId_questionId: { assessmentId: mathQuiz1.id, questionId: mathQ1.id } }, update: {}, create: { assessmentId: mathQuiz1.id, sectionId: mathQ1Section.id, questionId: mathQ1.id, questionNumber: 1, marksAvailable: 10 } });
  await prisma.assessmentQuestion.upsert({ where: { assessmentId_questionId: { assessmentId: mathQuiz1.id, questionId: mathQ2.id } }, update: {}, create: { assessmentId: mathQuiz1.id, sectionId: mathQ1Section.id, questionId: mathQ2.id, questionNumber: 2, marksAvailable: 10 } });
  await prisma.assessmentQuestion.upsert({ where: { assessmentId_questionId: { assessmentId: mathQuiz1.id, questionId: mathQ3.id } }, update: {}, create: { assessmentId: mathQuiz1.id, sectionId: mathQ1Section.id, questionId: mathQ3.id, questionNumber: 3, marksAvailable: 10 } });

  const { assessment: sciQuiz1, section: sciQ1Section } = await createAssessment(quizType.id, sciSubject.id, gradeLevel.id, term.id, 'Week 2 Science Quiz — Shapes', 30, 'published', 2);
  await prisma.assessmentQuestion.upsert({ where: { assessmentId_questionId: { assessmentId: sciQuiz1.id, questionId: sciQ1.id } }, update: {}, create: { assessmentId: sciQuiz1.id, sectionId: sciQ1Section.id, questionId: sciQ1.id, questionNumber: 1, marksAvailable: 10 } });
  await prisma.assessmentQuestion.upsert({ where: { assessmentId_questionId: { assessmentId: sciQuiz1.id, questionId: sciQ2.id } }, update: {}, create: { assessmentId: sciQuiz1.id, sectionId: sciQ1Section.id, questionId: sciQ2.id, questionNumber: 2, marksAvailable: 10 } });
  await prisma.assessmentQuestion.upsert({ where: { assessmentId_questionId: { assessmentId: sciQuiz1.id, questionId: sciQ3.id } }, update: {}, create: { assessmentId: sciQuiz1.id, sectionId: sciQ1Section.id, questionId: sciQ3.id, questionNumber: 3, marksAvailable: 10 } });

  const { assessment: mathMidterm } = await createAssessment(midtermType.id, mathSubject.id, gradeLevel.id, term.id, 'Fall Midterm — Mathematics', 100, 'published', 8);
  const { assessment: sciMidterm } = await createAssessment(midtermType.id, sciSubject.id, gradeLevel.id, term.id, 'Autumn Check-in — Science', 100, 'published', 8);
  const { assessment: mathFinal } = await createAssessment(finalType.id, mathSubject.id, gradeLevel.id, term.id, 'Final Exam — Mathematics', 100, 'draft', 16);
  const { assessment: sciHw } = await createAssessment(hwType.id, sciSubject.id, gradeLevel.id, term.id, 'Science Homework — Sorting & Patterns', 20, 'published', 3);
  console.log('✅ Seeded assessments');

  // ─── Students ─────────────────────────────────────────────────────────────────
  console.log('🌱 Seeding students...');
  const allStudentData = [
    { email: 'charlotte@example.com', firstName: 'Charlotte', lastName: 'Harris', gender: 'FEMALE', birth: '2010-05-15', sectionId: sectionA.id, placement: 'PLACED' },
    { email: 'elijah.m@example.com', firstName: 'Elijah', lastName: 'Miller', gender: 'MALE', birth: '2010-08-22', sectionId: sectionA.id, placement: 'PENDING' },
    { email: 'aria.w@example.com', firstName: 'Aria', lastName: 'Watson', gender: 'FEMALE', birth: '2010-03-10', sectionId: sectionA.id, placement: 'PLACED' },
    { email: 'lucas.b@example.com', firstName: 'Lucas', lastName: 'Brooks', gender: 'MALE', birth: '2010-11-30', sectionId: sectionA.id, placement: 'PLACED' },
    { email: 'noah.j@example.com', firstName: 'Noah', lastName: 'Johnson', gender: 'MALE', birth: '2010-03-22', sectionId: sectionA.id, placement: 'PLACED' },
    { email: 'emma.d@example.com', firstName: 'Emma', lastName: 'Davis', gender: 'FEMALE', birth: '2010-07-14', sectionId: sectionA.id, placement: 'PLACED' },
    { email: 'oliver.w@example.com', firstName: 'Oliver', lastName: 'Wilson', gender: 'MALE', birth: '2010-01-08', sectionId: sectionB.id, placement: 'PLACED' },
    { email: 'sophia.m@example.com', firstName: 'Sophia', lastName: 'Martinez', gender: 'FEMALE', birth: '2010-09-30', sectionId: sectionB.id, placement: 'PLACED' },
    { email: 'william.a@example.com', firstName: 'William', lastName: 'Anderson', gender: 'MALE', birth: '2010-11-17', sectionId: sectionB.id, placement: 'PLACED' },
    { email: 'isabella.t@example.com', firstName: 'Isabella', lastName: 'Thomas', gender: 'FEMALE', birth: '2010-06-25', sectionId: sectionB.id, placement: 'PLACED' },
    { email: 'james.ta@example.com', firstName: 'James', lastName: 'Taylor', gender: 'MALE', birth: '2010-04-12', sectionId: mathSection.id, placement: 'PLACED' },
    { email: 'mia.g@example.com', firstName: 'Mia', lastName: 'Garcia', gender: 'FEMALE', birth: '2010-08-03', sectionId: mathSection.id, placement: 'PLACED' },
  ];

  const studentProfiles: any[] = [];
  for (const s of allStudentData) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, password: hashedPassword, firstName: s.firstName, lastName: s.lastName, isActive: true },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: userRole.id } },
      update: {},
      create: { userId: user.id, roleId: userRole.id },
    });
    const profile = await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: { fullName: `${s.firstName} ${s.lastName}`, status: 'ACTIVE' },
      create: { userId: user.id, fullName: `${s.firstName} ${s.lastName}`, birthDate: new Date(s.birth), gender: s.gender as any, status: 'ACTIVE' },
    });
    studentProfiles.push({ ...profile, firstName: s.firstName, lastName: s.lastName, sectionId: s.sectionId });

    await prisma.studentClassPlacement.upsert({
      where: { studentProfileId_classSectionId: { studentProfileId: profile.id, classSectionId: s.sectionId } },
      update: {},
      create: { studentProfileId: profile.id, classSectionId: s.sectionId, academicYearId: academicYear.id, status: s.placement as any, isActive: true },
    });

    // Enroll in course classes
    for (const cc of [dsaClass, algClass, webClass, calcClass, engClass]) {
      await prisma.studentCourseEnrollment.upsert({
        where: { studentProfileId_batchId: { studentProfileId: profile.id, batchId: cc.id } },
        update: {},
        create: { studentProfileId: profile.id, batchId: cc.id, status: 'ENROLLED' },
      });
    }

    // Streak & XP
    await prisma.studentStreak.upsert({
      where: { studentProfileId: profile.id },
      update: {},
      create: { studentProfileId: profile.id, currentStreak: Math.floor(Math.random() * 15) + 1, longestStreak: Math.floor(Math.random() * 30) + 5, lastActiveDate: new Date('2026-06-23'), streakCharges: 1 },
    });
    await prisma.studentExperience.upsert({
      where: { studentProfileId: profile.id },
      update: {},
      create: { studentProfileId: profile.id, totalXp: Math.floor(Math.random() * 800) + 100, level: Math.floor(Math.random() * 5) + 1, nextLevelXp: 500 },
    });
  }
  console.log('✅ Seeded students');

  // ─── Attendance ───────────────────────────────────────────────────────────────
  console.log('🌱 Seeding attendance...');
  const sectionAStudents = studentProfiles.filter(p => p.sectionId === sectionA.id);
  const attendanceDates = [
    '2026-06-09','2026-06-10','2026-06-11','2026-06-12','2026-06-13',
    '2026-06-16','2026-06-17','2026-06-18','2026-06-19','2026-06-20',
    '2026-06-23',
  ];
  const absentOverrides: Record<string, string[]> = {
    'Charlotte Harris': ['2026-06-12'],
    'Elijah Miller': ['2026-06-16', '2026-06-17'],
    'Noah Johnson': ['2026-06-10'],
  };
  const lateOverrides: Record<string, string[]> = {
    'Aria Watson': ['2026-06-11'],
    'Emma Davis': ['2026-06-19'],
  };

  for (const profile of sectionAStudents) {
    const name = `${profile.firstName} ${profile.lastName}`;
    for (const dateStr of attendanceDates) {
      const date = new Date(dateStr);
      let status: string = 'PRESENT';
      let remarks: string = 'On time';
      if (absentOverrides[name]?.includes(dateStr)) { status = 'ABSENT'; remarks = 'Absent'; }
      else if (lateOverrides[name]?.includes(dateStr)) { status = 'LATE'; remarks = 'Arrived late'; }
      await prisma.dailyAttendance.upsert({
        where: { studentProfileId_classSectionId_date: { studentProfileId: profile.id, classSectionId: sectionA.id, date } },
        update: { status: status as any, remarks },
        create: { studentProfileId: profile.id, classSectionId: sectionA.id, date, status: status as any, remarks, recordedById: superAdminUser.id },
      });
    }
  }
  console.log('✅ Seeded attendance');

  // ─── Homework ─────────────────────────────────────────────────────────────────
  console.log('🌱 Seeding homework...');
  const mitchellUser = teacherUsers['EMP-MITCHELL'];

  const hw1 = await prisma.homework.upsert({
    where: { id: (await prisma.homework.findFirst({ where: { title: 'Times Tables Practice 1', batchId: dsaClass.id } }))?.id ?? 'nonexistent-id' },
    update: {},
    create: { batchId: dsaClass.id, title: 'Times Tables Practice 1', description: 'Practise the 2, 5 and 10 times tables. Write each answer out in full.', dueDate: new Date('2026-09-25'), maxPoints: 100, recordedById: mitchellUser.id },
  }).catch(async () => {
    const existing = await prisma.homework.findFirst({ where: { title: 'Times Tables Practice 1', batchId: dsaClass.id } });
    if (existing) return existing;
    return prisma.homework.create({ data: { batchId: dsaClass.id, title: 'Times Tables Practice 1', description: 'Practise the 2, 5 and 10 times tables. Write each answer out in full.', dueDate: new Date('2026-09-25'), maxPoints: 100, recordedById: mitchellUser.id } });
  });

  const hw2 = await (async () => {
    const existing = await prisma.homework.findFirst({ where: { title: 'Shape Hunt Project', batchId: webClass.id } });
    if (existing) return existing;
    return prisma.homework.create({ data: { batchId: webClass.id, title: 'Shape Hunt Project', description: 'Find five different shapes around your home and draw each one.', dueDate: new Date('2026-09-30'), maxPoints: 100, recordedById: mitchellUser.id } });
  })();

  const hw3 = await (async () => {
    const existing = await prisma.homework.findFirst({ where: { title: 'Fractions Worksheet 1', batchId: calcClass.id } });
    if (existing) return existing;
    return prisma.homework.create({ data: { batchId: calcClass.id, title: 'Fractions Worksheet 1', description: 'Practise equivalent fractions using the number line.', dueDate: new Date('2026-09-22'), maxPoints: 50, recordedById: superAdminUser.id } });
  })();

  // Homework submissions
  const sectionAPlacedStudents = sectionAStudents.filter(p => p.firstName !== 'Elijah');
  const submissionScores: Record<string, number[]> = {
    'Charlotte': [88, 92, 45],
    'Aria': [95, 78, 48],
    'Lucas': [72, 85, 38],
    'Noah': [90, 88, 47],
    'Emma': [85, 91, 42],
  };

  for (const profile of sectionAPlacedStudents) {
    const scores = submissionScores[profile.firstName] ?? [75, 80, 40];
    for (const [hwObj, score] of [[hw1, scores[0]], [hw2, scores[1]], [hw3, scores[2]]] as [any, number][]) {
      const existing = await prisma.homeworkSubmission.findFirst({ where: { homeworkId: hwObj.id, studentProfileId: profile.id } });
      if (!existing) {
        await prisma.homeworkSubmission.create({
          data: { homeworkId: hwObj.id, studentProfileId: profile.id, status: 'GRADED', content: `Submission by ${profile.firstName}`, pointsEarned: score, feedback: score >= 85 ? 'Excellent work!' : score >= 70 ? 'Good effort.' : 'Needs improvement.', gradedById: mitchellUser.id, gradedAt: new Date() },
        });
      }
    }
  }
  console.log('✅ Seeded homework');

  // ─── Assessment Assignments & Attempts ───────────────────────────────────────
  console.log('🌱 Seeding assessment assignments & attempts...');
  const opensAt = new Date('2026-09-15');
  const dueAt = new Date('2026-09-16');

  const attemptScores: Record<string, Record<string, number>> = {
    'Charlotte': { mathQuiz1: 27, sciQuiz1: 24, mathMidterm: 85, sciMidterm: 91 },
    'Aria': { mathQuiz1: 30, sciQuiz1: 28, mathMidterm: 92, sciMidterm: 88 },
    'Lucas': { mathQuiz1: 21, sciQuiz1: 20, mathMidterm: 72, sciMidterm: 74 },
    'Noah': { mathQuiz1: 26, sciQuiz1: 25, mathMidterm: 80, sciMidterm: 83 },
    'Emma': { mathQuiz1: 28, sciQuiz1: 26, mathMidterm: 88, sciMidterm: 86 },
  };

  const assessmentMap: Record<string, { id: string; totalMarks: number }> = {
    mathQuiz1: { id: mathQuiz1.id, totalMarks: 30 },
    sciQuiz1: { id: sciQuiz1.id, totalMarks: 30 },
    mathMidterm: { id: mathMidterm.id, totalMarks: 100 },
    sciMidterm: { id: sciMidterm.id, totalMarks: 100 },
  };

  for (const profile of sectionAPlacedStudents) {
    const scores = attemptScores[profile.firstName] ?? { mathQuiz1: 20, sciQuiz1: 18, mathMidterm: 70, sciMidterm: 70 };
    for (const [key, { id: assessmentId, totalMarks }] of Object.entries(assessmentMap)) {
      const existingAssignment = await prisma.assessmentAssignment.findFirst({ where: { assessmentId, studentProfileId: profile.id } });
      let assignment = existingAssignment;
      if (!assignment) {
        assignment = await prisma.assessmentAssignment.create({
          data: { assessmentId, studentProfileId: profile.id, assignedByUserId: superAdminUser.id, opensAt, dueAt, status: 'assigned' },
        });
      }
      const existingAttempt = await prisma.assessmentAttempt.findFirst({ where: { assessmentAssignmentId: assignment.id, studentProfileId: profile.id } });
      if (!existingAttempt) {
        const rawScore = (scores as any)[key] ?? 20;
        await prisma.assessmentAttempt.create({
          data: { assessmentAssignmentId: assignment.id, studentProfileId: profile.id, attemptNumber: 1, startedAt: new Date('2026-09-15T09:00:00'), submittedAt: new Date('2026-09-15T09:28:00'), timeSpentSeconds: 1680, rawScore, maxScore: totalMarks, percentageScore: Math.round((rawScore / totalMarks) * 100), resultStatus: 'marked', isLatest: true, isBest: true, markedByUserId: superAdminUser.id, teacherComment: rawScore / totalMarks >= 0.85 ? 'Excellent!' : 'Keep it up.' },
        });
      }
    }
  }
  console.log('✅ Seeded assessment assignments & attempts');

  // ─── GradeBook Entries ────────────────────────────────────────────────────────
  console.log('🌱 Seeding gradebook...');
  const gradeData: { name: string; mathQ: number; csQ: number; mathM: number; csM: number; hw: number }[] = [
    { name: 'Charlotte', mathQ: 90, csQ: 80, mathM: 85, csM: 91, hw: 88 },
    { name: 'Aria', mathQ: 100, csQ: 93, mathM: 92, csM: 88, hw: 95 },
    { name: 'Lucas', mathQ: 70, csQ: 67, mathM: 72, csM: 74, hw: 72 },
    { name: 'Noah', mathQ: 87, csQ: 83, mathM: 80, csM: 83, hw: 90 },
    { name: 'Emma', mathQ: 93, csQ: 87, mathM: 88, csM: 86, hw: 85 },
  ];

  for (const profile of sectionAPlacedStudents) {
    const g = gradeData.find(d => d.name === profile.firstName) ?? { mathQ: 75, csQ: 70, mathM: 75, csM: 70, hw: 75 };
    const entries = [
      { title: 'Week 1 Math Quiz', category: 'QUIZ', points: g.mathQ, possible: 100, srcType: 'ASSESSMENT_ATTEMPT' as const, srcId: `mq1-${profile.id}` },
      { title: 'Week 2 Science Quiz', category: 'QUIZ', points: g.csQ, possible: 100, srcType: 'ASSESSMENT_ATTEMPT' as const, srcId: `csq1-${profile.id}` },
      { title: 'Fall Midterm — Math', category: 'MIDTERM', points: g.mathM, possible: 100, srcType: 'ASSESSMENT_ATTEMPT' as const, srcId: `mm-${profile.id}` },
      { title: 'Fall Midterm — CS', category: 'MIDTERM', points: g.csM, possible: 100, srcType: 'ASSESSMENT_ATTEMPT' as const, srcId: `csm-${profile.id}` },
      { title: 'Times Tables Practice 1', category: 'HOMEWORK', points: g.hw, possible: 100, srcType: 'HOMEWORK_SUBMISSION' as const, srcId: `hw1-${profile.id}` },
    ];
    for (const e of entries) {
      const existing = await prisma.gradeBookEntry.findFirst({ where: { studentProfileId: profile.id, sourceType: e.srcType, sourceId: e.srcId } });
      if (!existing) {
        await prisma.gradeBookEntry.create({
          data: { studentProfileId: profile.id, batchId: dsaClass.id, termId: term.id, sourceType: e.srcType, sourceId: e.srcId, title: e.title, category: e.category, pointsEarned: e.points, pointsPossible: e.possible, percentage: e.points, weight: 1.0, status: 'PUBLISHED', assessedAt: new Date('2026-09-16'), publishedAt: new Date(), createdById: superAdminUser.id },
        });
      }
    }
  }
  console.log('✅ Seeded gradebook');

  // ─── Lesson Attempts (Gamification) ──────────────────────────────────────────
  console.log('🌱 Seeding lesson attempts...');
  const allLessons = [lesson1!, lesson2!, lesson3!, lesson4!];
  for (const profile of studentProfiles.slice(0, 8)) {
    for (const lesson of allLessons) {
      const existing = await prisma.lessonAttempt.findFirst({ where: { lessonId: lesson.id, studentProfileId: profile.id } });
      if (!existing) {
        await prisma.lessonAttempt.create({ data: { lessonId: lesson.id, studentProfileId: profile.id, status: 'COMPLETED', xpEarned: lesson.xpReward, startedAt: new Date('2026-09-10'), completedAt: new Date('2026-09-10'), timeSpentSeconds: 420 } });
      }
    }
  }
  console.log('✅ Seeded lesson attempts');

  // ─── Guardians & Families ─────────────────────────────────────────────────────
  console.log('🌱 Seeding guardians & families...');
  const guardian1User = await prisma.user.upsert({
    where: { email: 'guardian.harris@example.com' },
    update: {},
    create: { email: 'guardian.harris@example.com', password: hashedPassword, firstName: 'Robert', lastName: 'Harris', isActive: true },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: guardian1User.id, roleId: guardianRole.id } }, update: {}, create: { userId: guardian1User.id, roleId: guardianRole.id } });
  const guardian1Profile = await prisma.guardianProfile.upsert({
    where: { userId: guardian1User.id },
    update: {},
    create: { userId: guardian1User.id, fullName: 'Robert Harris', email: 'guardian.harris@example.com', phone: '(555) 200-0001', status: 'ACTIVE' },
  });

  const charlotteProfile = studentProfiles.find(p => p.firstName === 'Charlotte');
  if (charlotteProfile) {
    const existingRel = await prisma.guardianStudentRelationship.findFirst({ where: { guardianProfileId: guardian1Profile.id, studentProfileId: charlotteProfile.id } });
    if (!existingRel) {
      await prisma.guardianStudentRelationship.create({ data: { guardianProfileId: guardian1Profile.id, studentProfileId: charlotteProfile.id, relationshipType: 'FATHER', isPrimary: true, hasFinancialResponsibility: true, hasAcademicAccess: true, hasEmergencyContact: true } });
    }
  }
  console.log('✅ Seeded guardians & families');

  // ─── Leads ────────────────────────────────────────────────────────────────────
  console.log('🌱 Seeding leads...');
  await prisma.lead.deleteMany();
  await prisma.lead.createMany({
    data: [
      { name: 'Charlotte Harris', email: 'charlotte@example.com', phone: '(555) 019-8832', status: 'Enrolled', source: 'Website Form', notes: 'Enrolled in Grade 2 Maths.' },
      { name: 'Elijah Miller', email: 'elijah.m@example.com', phone: '(555) 012-3841', status: 'Diagnostic Scheduled', source: 'Referral', notes: 'Needs diagnostic assessment for math level alignment.' },
      { name: 'Aria Watson', email: 'aria.w@example.com', phone: '(555) 019-3392', status: 'Enrolled', source: 'Facebook Ad', notes: 'Completed evaluation and enrolled.' },
      { name: 'Lucas Brooks', email: 'lucas.b@example.com', phone: '(555) 015-2831', status: 'Enrolled', source: 'Walk-in', notes: 'Fully enrolled in BSC-CS program.' },
      { name: 'Noah Johnson', email: 'noah.j@example.com', phone: '(555) 030-1122', status: 'Enrolled', source: 'Website Form', notes: 'Enrolled via online portal.' },
      { name: 'Emma Davis', email: 'emma.d@example.com', phone: '(555) 030-3344', status: 'Pending Enrolment', source: 'Referral', notes: 'Awaiting final enrollment confirmation.' },
      { name: 'Oliver Wilson', email: 'oliver.w@example.com', phone: '(555) 030-5566', status: 'Enrolled', source: 'School Fair', notes: 'Enrolled in CS Section B.' },
      { name: 'Sophia Martinez', email: 'sophia.m@example.com', phone: '(555) 030-7788', status: 'Enrolled', source: 'Website Form', notes: 'Enrolled after passing diagnostic.' },
      { name: 'Aiden Clark', email: 'aiden.c@example.com', phone: '(555) 040-1234', status: 'New', source: 'Website Form', notes: 'Just submitted inquiry form.' },
      { name: 'Olivia Brown', email: 'olivia.b@example.com', phone: '(555) 040-5678', status: 'Diagnostic Scheduled', source: 'Social Media', notes: 'Diagnostic scheduled for June 25.' },
    ],
  });
  console.log('✅ Seeded leads');

  // ─── Broadcasts ───────────────────────────────────────────────────────────────
  console.log('🌱 Seeding broadcasts...');
  await prisma.broadcast.deleteMany();
  await prisma.broadcast.createMany({
    data: [
      // status/recipientCount deliberately omitted so the column defaults
      // (RECORDED / 0) apply. These used to seed 'SENT' with invented counts
      // — 350 recipients for a weather advisory that was never dispatched —
      // which put five fabricated delivery records in the log as history.
      { type: 'Announcement', title: 'Fall Semester 2026 Registration Open', content: 'Registration is now open for all programs in the Fall 2026 term. Deadline: August 30.', sender: 'System' },
      { type: 'SMS Alert', title: 'Attendance Reminder Sent to Parent (Watson)', content: 'Watson was late for morning roll call on June 11.', sender: 'Main Campus Branch' },
      { type: 'Email Broadcast', title: 'Tuition Invoices Generated', content: 'Term invoices for Fall Semester 2026 have been issued. Please check the billing portal.', sender: 'Billing System' },
      { type: 'Announcement', title: 'Mid-Semester Progress Reports Available', content: 'Progress reports for the first half of Fall 2026 are now available in the parent portal.', sender: 'Academic Office' },
      { type: 'SMS Alert', title: 'School Closure — Weather Advisory', content: 'Classes are suspended tomorrow due to a weather advisory. Online sessions will be held.', sender: 'Main Campus' },
    ],
  });
  console.log('✅ Seeded broadcasts');

  // ─── Notifications ────────────────────────────────────────────────────────────
  console.log('🌱 Seeding notifications...');
  await prisma.notification.deleteMany();
  await prisma.notification.createMany({
    data: [
      { userId: superAdminUser.id, type: 'INFO', title: 'Welcome to Eudora', body: 'Welcome to your new educational management dashboard. Explore your administrative options!', readAt: null },
      { userId: superAdminUser.id, type: 'WARNING', title: 'High Makeup Request Volume', body: 'There are 3 pending makeup requests that require your attention.', readAt: null },
      { userId: superAdminUser.id, type: 'SYSTEM', title: 'Backup Successful', body: 'System database backup completed successfully.', readAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      { userId: superAdminUser.id, type: 'INFO', title: 'New Student Enrollment', body: 'Emma Davis has completed enrollment and has been placed in CS Section A.', readAt: null },
      { userId: superAdminUser.id, type: 'INFO', title: 'Sessions Generated', body: 'Autumn sessions for Grade 2 Morning Group have been generated.', readAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      { userId: superAdminUser.id, type: 'WARNING', title: 'Assessment Due Soon', body: 'The Fall Midterm — Mathematics closes in 24 hours. 2 students have not yet submitted.', readAt: null },
    ],
  });
  console.log('✅ Seeded notifications');

  // ─── Course Class Sessions & Session Attendance ─────────────────────────────
  console.log('🌱 Seeding course class sessions...');
  const sessionDefs = [
    { batchId: dsaClass.id, date: '2026-09-15', topic: 'Counting in Twos', start: '08:00', end: '09:00' },
    { batchId: dsaClass.id, date: '2026-09-18', topic: 'Times Tables: 2 and 5', start: '08:00', end: '09:00' },
    { batchId: dsaClass.id, date: '2026-09-22', topic: 'Times Tables: 10', start: '08:00', end: '09:00' },
    { batchId: dsaClass.id, date: '2026-09-25', topic: 'Word Problems with Times Tables', start: '08:00', end: '09:00' },
    { batchId: dsaClass.id, date: '2026-09-29', topic: 'Hash Tables', start: '08:00', end: '09:00' },
    { batchId: dsaClass.id, date: '2026-10-02', topic: 'Graph Representation', start: '08:00', end: '09:00' },
    { batchId: dsaClass.id, date: '2026-10-06', topic: 'BFS and DFS', start: '08:00', end: '09:00' },
    { batchId: dsaClass.id, date: '2026-10-09', topic: 'Dynamic Programming Introduction', start: '08:00', end: '09:00' },
    { batchId: algClass.id, date: '2026-09-15', topic: 'Big-O Notation', start: '09:10', end: '10:20' },
    { batchId: algClass.id, date: '2026-09-18', topic: 'Divide and Conquer', start: '09:10', end: '10:20' },
    { batchId: algClass.id, date: '2026-09-22', topic: 'Putting Numbers in Order', start: '09:10', end: '10:20' },
    { batchId: algClass.id, date: '2026-09-25', topic: 'Merge Sort & Quick Sort', start: '09:10', end: '10:20' },
    { batchId: webClass.id, date: '2026-09-15', topic: 'Measuring with a Ruler', start: '10:40', end: '12:00' },
    { batchId: webClass.id, date: '2026-09-18', topic: 'Comparing Lengths', start: '10:40', end: '12:00' },
    { batchId: webClass.id, date: '2026-09-22', topic: 'Responsive Design', start: '10:40', end: '12:00' },
    { batchId: calcClass.id, date: '2026-09-15', topic: 'Limits and Continuity', start: '12:30', end: '13:50' },
    { batchId: calcClass.id, date: '2026-09-18', topic: 'Introduction to Derivatives', start: '12:30', end: '13:50' },
    { batchId: calcClass.id, date: '2026-09-22', topic: 'Chain Rule', start: '12:30', end: '13:50' },
    { batchId: engClass.id, date: '2026-09-15', topic: 'Paragraph Structure', start: '14:00', end: '15:00' },
    { batchId: engClass.id, date: '2026-09-18', topic: 'Thesis Statements', start: '14:00', end: '15:00' },
    { batchId: engClass.id, date: '2026-09-22', topic: 'Evidence & Citations', start: '14:00', end: '15:00' },
  ];

  const sessions: any[] = [];
  for (const sd of sessionDefs) {
    const d = new Date(sd.date);
    const existing = await prisma.batchSession.findFirst({ where: { batchId: sd.batchId, date: d } });
    const session = existing ?? await prisma.batchSession.create({
      data: {
        batchId: sd.batchId,
        date: d,
        startTime: new Date(`${sd.date}T${sd.start}:00.000Z`),
        endTime: new Date(`${sd.date}T${sd.end}:00.000Z`),
        topic: sd.topic,
      },
    });
    sessions.push(session);
  }

  // Session attendance — all sectionA students, Elijah absent early
  const sectionAAll = studentProfiles.filter(p => p.sectionId === sectionA.id);
  const sessionAbsences: Record<string, string[]> = {
    'Elijah': ['2026-09-15', '2026-09-18'],
    'Charlotte': ['2026-09-29'],
  };
  const sessionLate: Record<string, string[]> = {
    'Aria': ['2026-09-22'],
    'Noah': ['2026-10-02'],
  };
  for (const session of sessions) {
    if (session.batchId !== dsaClass.id) continue; // only seed DSA session attendance
    const dateStr = (session.date instanceof Date ? session.date : new Date(session.date)).toISOString().slice(0, 10);
    for (const profile of sectionAAll) {
      const isAbsent = sessionAbsences[profile.firstName]?.includes(dateStr);
      const isLate = !isAbsent && sessionLate[profile.firstName]?.includes(dateStr);
      const existing = await prisma.batchAttendance.findFirst({ where: { studentProfileId: profile.id, sessionId: session.id } });
      if (!existing) {
        await prisma.batchAttendance.create({
          data: {
            studentProfileId: profile.id,
            sessionId: session.id,
            status: isAbsent ? 'ABSENT' : isLate ? 'LATE' : 'PRESENT',
            remarks: isAbsent ? 'Absent — excused' : isLate ? 'Arrived late' : 'Present',
            recordedById: superAdminUser.id,
          },
        });
      }
    }
  }
  console.log('✅ Seeded course class sessions');

  // ─── Student Responses ───────────────────────────────────────────────────────
  console.log('🌱 Seeding student responses...');
  const mathQ1Opts = await prisma.questionOption.findMany({ where: { questionId: mathQ1.id } });
  const mathQ2Opts = await prisma.questionOption.findMany({ where: { questionId: mathQ2.id } });
  const mathQ3Opts = await prisma.questionOption.findMany({ where: { questionId: mathQ3.id } });
  const sciQ1Opts = await prisma.questionOption.findMany({ where: { questionId: sciQ1.id } });
  const sciQ2Opts = await prisma.questionOption.findMany({ where: { questionId: sciQ2.id } });
  const sciQ3Opts = await prisma.questionOption.findMany({ where: { questionId: sciQ3.id } });

  const cOpt = (opts: any[]) => opts.find((o: any) => o.isCorrect);
  const wOpt = (opts: any[]) => opts.find((o: any) => !o.isCorrect);

  // [mathQ1, mathQ2, mathQ3, sciQ1, sciQ2, sciQ3] — true = correct answer
  const responsePattern: Record<string, boolean[]> = {
    Charlotte: [true,  true,  false, true,  true,  false],
    Aria:      [true,  true,  true,  true,  true,  true],
    Lucas:     [true,  false, false, true,  false, false],
    Noah:      [true,  true,  false, true,  true,  false],
    Emma:      [true,  true,  false, true,  true,  true],
  };

  for (const profile of sectionAPlacedStudents) {
    const pat = responsePattern[profile.firstName] ?? [true, false, false, true, false, false];

    const mathAttempt = await prisma.assessmentAttempt.findFirst({
      where: { studentProfileId: profile.id, assignment: { assessmentId: mathQuiz1.id } },
    });
    if (mathAttempt) {
      for (const [i, { q, opts }] of [[0, { q: mathQ1, opts: mathQ1Opts }], [1, { q: mathQ2, opts: mathQ2Opts }], [2, { q: mathQ3, opts: mathQ3Opts }]] as [number, {q:any;opts:any[]}][]) {
        const isCorrect = pat[i];
        const selOpt = isCorrect ? cOpt(opts) : wOpt(opts);
        const exists = await prisma.studentResponse.findFirst({ where: { assessmentAttemptId: mathAttempt.id, questionId: q.id } });
        if (!exists && selOpt) {
          await prisma.studentResponse.create({ data: { assessmentAttemptId: mathAttempt.id, questionId: q.id, selectedOptionId: selOpt.id, isCorrect, marksAwarded: isCorrect ? 10 : 0, marksAvailable: 10, timeSpentSeconds: 65 } });
        }
      }
    }

    const csAttempt = await prisma.assessmentAttempt.findFirst({
      where: { studentProfileId: profile.id, assignment: { assessmentId: sciQuiz1.id } },
    });
    if (csAttempt) {
      for (const [i, { q, opts }] of [[3, { q: sciQ1, opts: sciQ1Opts }], [4, { q: sciQ2, opts: sciQ2Opts }], [5, { q: sciQ3, opts: sciQ3Opts }]] as [number, {q:any;opts:any[]}][]) {
        const isCorrect = pat[i];
        const selOpt = isCorrect ? cOpt(opts) : wOpt(opts);
        const exists = await prisma.studentResponse.findFirst({ where: { assessmentAttemptId: csAttempt.id, questionId: q.id } });
        if (!exists && selOpt) {
          await prisma.studentResponse.create({ data: { assessmentAttemptId: csAttempt.id, questionId: q.id, selectedOptionId: selOpt.id, isCorrect, marksAwarded: isCorrect ? 10 : 0, marksAvailable: 10, timeSpentSeconds: 58 } });
        }
      }
    }
  }
  console.log('✅ Seeded student responses');

  // ─── Student Card Responses ──────────────────────────────────────────────────
  console.log('🌱 Seeding student card responses...');
  const allLessonsForCards = [lesson1!, lesson2!, lesson3!, lesson4!];
  for (const profile of studentProfiles.slice(0, 10)) {
    for (const lesson of allLessonsForCards) {
      const attempt = await prisma.lessonAttempt.findFirst({ where: { lessonId: lesson.id, studentProfileId: profile.id } });
      if (!attempt) continue;
      const cards = await prisma.card.findMany({ where: { lessonId: lesson.id }, orderBy: { sortOrder: 'asc' } });
      for (const card of cards) {
        const existing = await prisma.studentCardResponse.findFirst({ where: { lessonAttemptId: attempt.id, cardId: card.id } });
        if (!existing) {
          const isConceptual = card.cardType === 'CONCEPTUAL';
          await prisma.studentCardResponse.create({
            data: {
              lessonAttemptId: attempt.id,
              cardId: card.id,
              attemptsCount: isConceptual ? 1 : (profile.firstName === 'Lucas' ? 2 : 1),
              hintsViewedCount: isConceptual ? 0 : (profile.firstName === 'Elijah' ? 1 : 0),
              isCorrect: isConceptual ? true : responsePattern[profile.firstName]?.[0] ?? true,
              interactionTrace: isConceptual ? undefined : { events: ['view', 'select'], durationMs: 12400 },
            },
          });
        }
      }
    }
  }
  console.log('✅ Seeded student card responses');

  // ─── More Guardians ──────────────────────────────────────────────────────────
  console.log('🌱 Seeding additional guardians...');
  const ariaProfile = studentProfiles.find(p => p.firstName === 'Aria');
  const noahProfile = studentProfiles.find(p => p.firstName === 'Noah');
  const lucasProfile = studentProfiles.find(p => p.firstName === 'Lucas');

  const guardian2User = await prisma.user.upsert({
    where: { email: 'guardian.watson@example.com' },
    update: {},
    create: { email: 'guardian.watson@example.com', password: hashedPassword, firstName: 'Helen', lastName: 'Watson', isActive: true },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: guardian2User.id, roleId: guardianRole.id } }, update: {}, create: { userId: guardian2User.id, roleId: guardianRole.id } });
  const guardian2Profile = await prisma.guardianProfile.upsert({
    where: { userId: guardian2User.id },
    update: {},
    create: { userId: guardian2User.id, fullName: 'Helen Watson', email: 'guardian.watson@example.com', phone: '(555) 200-0002', status: 'ACTIVE' },
  });
  if (ariaProfile) {
    const existRel = await prisma.guardianStudentRelationship.findFirst({ where: { guardianProfileId: guardian2Profile.id, studentProfileId: ariaProfile.id } });
    if (!existRel) await prisma.guardianStudentRelationship.create({ data: { guardianProfileId: guardian2Profile.id, studentProfileId: ariaProfile.id, relationshipType: 'MOTHER', isPrimary: true, hasFinancialResponsibility: true, hasAcademicAccess: true, hasEmergencyContact: true } });
  }

  const guardian3User = await prisma.user.upsert({
    where: { email: 'guardian.johnson@example.com' },
    update: {},
    create: { email: 'guardian.johnson@example.com', password: hashedPassword, firstName: 'David', lastName: 'Johnson', isActive: true },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: guardian3User.id, roleId: guardianRole.id } }, update: {}, create: { userId: guardian3User.id, roleId: guardianRole.id } });
  const guardian3Profile = await prisma.guardianProfile.upsert({
    where: { userId: guardian3User.id },
    update: {},
    create: { userId: guardian3User.id, fullName: 'David Johnson', email: 'guardian.johnson@example.com', phone: '(555) 200-0003', status: 'ACTIVE' },
  });
  if (noahProfile) {
    const existRel = await prisma.guardianStudentRelationship.findFirst({ where: { guardianProfileId: guardian3Profile.id, studentProfileId: noahProfile.id } });
    if (!existRel) await prisma.guardianStudentRelationship.create({ data: { guardianProfileId: guardian3Profile.id, studentProfileId: noahProfile.id, relationshipType: 'FATHER', isPrimary: true, hasFinancialResponsibility: true, hasAcademicAccess: true, hasEmergencyContact: true } });
  }

  const guardian4User = await prisma.user.upsert({
    where: { email: 'guardian.brooks@example.com' },
    update: {},
    create: { email: 'guardian.brooks@example.com', password: hashedPassword, firstName: 'Sandra', lastName: 'Brooks', isActive: true },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: guardian4User.id, roleId: guardianRole.id } }, update: {}, create: { userId: guardian4User.id, roleId: guardianRole.id } });
  const guardian4Profile = await prisma.guardianProfile.upsert({
    where: { userId: guardian4User.id },
    update: {},
    create: { userId: guardian4User.id, fullName: 'Sandra Brooks', email: 'guardian.brooks@example.com', phone: '(555) 200-0004', status: 'ACTIVE' },
  });
  if (lucasProfile) {
    const existRel = await prisma.guardianStudentRelationship.findFirst({ where: { guardianProfileId: guardian4Profile.id, studentProfileId: lucasProfile.id } });
    if (!existRel) await prisma.guardianStudentRelationship.create({ data: { guardianProfileId: guardian4Profile.id, studentProfileId: lucasProfile.id, relationshipType: 'MOTHER', isPrimary: true, hasFinancialResponsibility: true, hasAcademicAccess: true, hasEmergencyContact: false } });
  }
  console.log('✅ Seeded additional guardians');

  // Teacher shortcuts used below for audit-log and notification seeding.
  const mitchellU = teacherUsers['EMP-MITCHELL'];
  const okaforU = teacherUsers['EMP-OKAFOR'];

  // ─── Section B Attendance ────────────────────────────────────────────────────

  // Section B daily attendance (same date range)
  const sectionBStudents = studentProfiles.filter(p => p.sectionId === sectionB.id);
  const bAbsences: Record<string, string[]> = { William: ['2026-06-18', '2026-06-19'], Sophia: ['2026-06-23'] };
  const bLate: Record<string, string[]> = { Isabella: ['2026-06-16'] };
  for (const profile of sectionBStudents) {
    for (const dateStr of attendanceDates) {
      const date = new Date(dateStr);
      const isAbsent = bAbsences[profile.firstName]?.includes(dateStr);
      const isLate = !isAbsent && bLate[profile.firstName]?.includes(dateStr);
      await prisma.dailyAttendance.upsert({
        where: { studentProfileId_classSectionId_date: { studentProfileId: profile.id, classSectionId: sectionB.id, date } },
        update: {},
        create: { studentProfileId: profile.id, classSectionId: sectionB.id, date, status: isAbsent ? 'ABSENT' : isLate ? 'LATE' : 'PRESENT', remarks: isAbsent ? 'Absent' : isLate ? 'Arrived late' : 'On time', recordedById: superAdminUser.id },
      });
    }
  }

  // Math section attendance
  const mathSectionStudents = studentProfiles.filter(p => p.sectionId === mathSection.id);
  for (const profile of mathSectionStudents) {
    for (const dateStr of attendanceDates) {
      const date = new Date(dateStr);
      await prisma.dailyAttendance.upsert({
        where: { studentProfileId_classSectionId_date: { studentProfileId: profile.id, classSectionId: mathSection.id, date } },
        update: {},
        create: { studentProfileId: profile.id, classSectionId: mathSection.id, date, status: 'PRESENT', remarks: 'On time', recordedById: superAdminUser.id },
      });
    }
  }
  console.log('✅ Seeded Section B attendance');

  // ─── GradeBook for Section B ─────────────────────────────────────────────────
  console.log('🌱 Seeding Section B gradebook...');
  const bGradeData: {name:string; mathQ:number; csQ:number}[] = [
    { name: 'Oliver',   mathQ: 82, csQ: 78 },
    { name: 'Sophia',   mathQ: 91, csQ: 88 },
    { name: 'William',  mathQ: 68, csQ: 72 },
    { name: 'Isabella', mathQ: 95, csQ: 90 },
  ];
  for (const profile of sectionBStudents) {
    const g = bGradeData.find(d => d.name === profile.firstName);
    if (!g) continue;
    const entries = [
      { title: 'Week 1 Math Quiz', cat: 'QUIZ', pts: g.mathQ, srcId: `mq1-b-${profile.id}`, srcType: 'ASSESSMENT_ATTEMPT' as const },
      { title: 'Week 2 Science Quiz',   cat: 'QUIZ', pts: g.csQ,   srcId: `csq1-b-${profile.id}`, srcType: 'ASSESSMENT_ATTEMPT' as const },
    ];
    for (const e of entries) {
      const exists = await prisma.gradeBookEntry.findFirst({ where: { studentProfileId: profile.id, sourceType: e.srcType, sourceId: e.srcId } });
      if (!exists) {
        await prisma.gradeBookEntry.create({ data: { studentProfileId: profile.id, termId: term.id, sourceType: e.srcType, sourceId: e.srcId, title: e.title, category: e.cat, pointsEarned: e.pts, pointsPossible: 100, percentage: e.pts, weight: 1.0, status: 'PUBLISHED', assessedAt: new Date('2026-09-16'), publishedAt: new Date(), createdById: superAdminUser.id } });
      }
    }
  }
  console.log('✅ Seeded Section B gradebook');

  // ─── Audit Logs ──────────────────────────────────────────────────────────────
  console.log('🌱 Seeding audit logs...');
  await prisma.auditLog.createMany({
    data: [
      { actorUserId: superAdminUser.id, event: 'SESSIONS_GENERATED', targetType: 'Batch', targetId: null, ipAddress: '127.0.0.1', metadata: { name: 'Grade 2 Morning Group' } },
      { actorUserId: superAdminUser.id, event: 'ASSESSMENT_PUBLISHED', targetType: 'Assessment', targetId: mathQuiz1.id, ipAddress: '127.0.0.1', metadata: { title: 'Week 1 Math Quiz — Fractions' } },
      { actorUserId: superAdminUser.id, event: 'ASSESSMENT_PUBLISHED', targetType: 'Assessment', targetId: sciQuiz1.id, ipAddress: '127.0.0.1', metadata: { title: 'Week 2 Science Quiz — Shapes' } },
      { actorUserId: superAdminUser.id, event: 'STUDENT_ENROLLED', targetType: 'StudentProfile', targetId: studentProfiles[0]?.id, ipAddress: '127.0.0.1', metadata: { name: 'Charlotte Harris', section: 'CS Section A' } },
      { actorUserId: superAdminUser.id, event: 'STUDENT_ENROLLED', targetType: 'StudentProfile', targetId: studentProfiles[4]?.id, ipAddress: '127.0.0.1', metadata: { name: 'Noah Johnson', section: 'CS Section A' } },
      { actorUserId: mitchellU.id, event: 'HOMEWORK_CREATED', targetType: 'Homework', targetId: hw1.id, ipAddress: '10.0.0.1', metadata: { title: 'Times Tables Practice 1' } },
      { actorUserId: mitchellU.id, event: 'GRADE_PUBLISHED', targetType: 'GradeBookEntry', targetId: null, ipAddress: '10.0.0.1', metadata: { assessment: 'Week 1 Math Quiz', studentCount: 5 } },
      { actorUserId: mitchellU.id, event: 'SESSION_CREATED', targetType: 'BatchSession', targetId: sessions[0]?.id ?? null, ipAddress: '10.0.0.1', metadata: { topic: 'Counting in Twos' } },
      { actorUserId: teacherUsers['EMP-OKAFOR'].id, event: 'HOMEWORK_GRADED', targetType: 'Homework', targetId: hw3.id, ipAddress: '10.0.0.2', metadata: { title: 'Fractions Worksheet 1' } },
      { actorUserId: teacherUsers['EMP-DASILVA'].id, event: 'SESSIONS_GENERATED', targetType: 'Batch', targetId: null, ipAddress: '10.0.0.3', metadata: { name: 'Grade 2 Afternoon Group' } },
      { actorUserId: superAdminUser.id, event: 'ATTENDANCE_RECORDED', targetType: 'DailyAttendance', targetId: null, ipAddress: '127.0.0.1', metadata: { date: '2026-06-23', sections: ['CS-2026-A', 'CS-2026-B'], totalRecords: 11 } },
    ],
  });
  console.log('✅ Seeded audit logs');

  // ─── Teacher & Guardian Notifications ────────────────────────────────────────
  console.log('🌱 Seeding teacher & guardian notifications...');
  await prisma.notification.createMany({
    data: [
      { userId: mitchellU.id, type: 'INFO',    title: 'New Message from Robert Harris', body: "Robert Harris sent a message about Charlotte's June 12 absence.", readAt: null },
      { userId: mitchellU.id, type: 'INFO',    title: 'Week 1 Quiz — All Submissions In', body: '5 students completed the Week 1 Math Quiz. Click to review.', readAt: new Date() },
      { userId: mitchellU.id, type: 'WARNING', title: 'Makeup Request Pending', body: "Charlotte Harris has an unresolved makeup request for the June 12 maths session.", readAt: null },
      { userId: mitchellU.id, type: 'INFO',    title: 'Noah Johnson — Midterm Marked', body: "Noah's Fall Midterm has been marked. Score: 80/100.", readAt: null },
      { userId: okaforU.id, type: 'INFO',    title: 'New Message from Robert Harris', body: 'Robert Harris asked about Fall Midterm topics for Charlotte.', readAt: new Date() },
      { userId: okaforU.id, type: 'WARNING', title: 'Fractions Worksheet 1 — 3 Not Submitted', body: 'Fractions Worksheet 1 deadline passed. 3 students still outstanding.', readAt: null },
      { userId: okaforU.id, type: 'INFO',    title: 'Gradebook Published', body: 'Your Week 1 Math Quiz grades have been published to students and guardians.', readAt: null },
      { userId: teacherUsers['EMP-DASILVA'].id, type: 'INFO',    title: 'Afternoon Group Sessions Live', body: 'Autumn sessions for Grade 2 Afternoon Group are now scheduled.', readAt: null },
      { userId: teacherUsers['EMP-DASILVA'].id, type: 'INFO',    title: 'New Message from Sandra Brooks', body: 'Sandra Brooks inquired about support resources for Lucas.', readAt: null },
      { userId: teacherUsers['EMP-NGUYEN'].id,  type: 'WARNING', title: 'Low Attendance Alert', body: "William Anderson was absent 2 days this week (June 18–19). Consider reaching out.", readAt: null },
      { userId: guardian1User.id, type: 'INFO',    title: 'Grade Published — Week 1 Math Quiz', body: "Charlotte's Week 1 Math Quiz grade (90%) is now available.", readAt: null },
      { userId: guardian1User.id, type: 'INFO',    title: 'Reply from Ms Mitchell', body: 'Sarah Mitchell replied to your message about the June 12 absence.', readAt: new Date() },
      { userId: guardian2User.id, type: 'INFO',    title: 'Aria scored 100% on Math Quiz!', body: 'Ms Mitchell has a message for you regarding Aria\'s outstanding performance.', readAt: null },
      { userId: guardian3User.id, type: 'INFO',    title: 'Reply from Ms Mitchell', body: 'Sarah Mitchell replied to your progress inquiry about Noah.', readAt: null },
      { userId: guardian4User.id, type: 'INFO',    title: 'Reply from Mr da Silva', body: 'Luis da Silva replied with tutoring support information for Lucas.', readAt: null },
    ],
  });
  console.log('✅ Seeded teacher & guardian notifications');

  // ─── Learning Catalog (Subjects, Courses, Learning Paths) ────────────────────
  console.log('🌱 Seeding learning catalog...');

  const mathLearningSubject = await prisma.learningSubject.upsert({
    where: { code: 'MATH' },
    update: {},
    create: { code: 'MATH', name: 'Mathematics', description: 'Numbers, algebra, geometry, and more.', sortOrder: 1 },
  });

  const algebraCourse = await prisma.course.upsert({
    where: { slug: 'algebra-foundations' },
    update: { gradeBand: 'G5_6' },
    create: {
      learningSubjectId: mathLearningSubject.id,
      title: 'Algebra Foundations',
      slug: 'algebra-foundations',
      description: 'Build a solid foundation in algebraic thinking, from variables to solving equations.',
      estimatedHours: 8,
      status: 'PUBLISHED',
      sortOrder: 1,
      gradeBand: 'G5_6',
    },
  });

  const variablesChapter = await prisma.concept.upsert({
    where: { name: 'Variables and Expressions' },
    update: { courseId: algebraCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Variables and Expressions', description: 'Introducing algebraic variables and how to form expressions with them.', courseId: algebraCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let variablesLesson = await prisma.lesson.findFirst({ where: { title: 'Intro to Variables', conceptId: variablesChapter.id } });
  if (!variablesLesson) {
    variablesLesson = await prisma.lesson.create({ data: { conceptId: variablesChapter.id, title: 'Intro to Variables', description: "What a variable is and how it stands in for a number.", sortOrder: 1, xpReward: 50 } });
    await prisma.card.create({ data: { lessonId: variablesLesson.id, title: 'What is a Variable?', sortOrder: 1, cardType: 'CONCEPTUAL', content: "A variable is a symbol — usually a letter like $$x$$ or $$y$$ — that stands in for a number we don't know yet." } });
  }

  const linearEquationsChapter = await prisma.concept.upsert({
    where: { name: 'Linear Equations' },
    update: { courseId: algebraCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Linear Equations', description: 'Solving one-variable linear equations step by step.', courseId: algebraCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let linearEquationsLesson = await prisma.lesson.findFirst({ where: { title: 'Solving for X', conceptId: linearEquationsChapter.id } });
  if (!linearEquationsLesson) {
    linearEquationsLesson = await prisma.lesson.create({ data: { conceptId: linearEquationsChapter.id, title: 'Solving for X', description: 'Isolating the variable to solve a simple linear equation.', sortOrder: 1, xpReward: 60 } });
    await prisma.card.create({ data: { lessonId: linearEquationsLesson.id, title: 'Balancing the Equation', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Whatever you do to one side of an equation, you must do to the other to keep it balanced.' } });
    const linEqQ = await prisma.question.create({ data: { subjectId: mathSubject.id, classId: gradeLevel.id, questionType: 'mcq', prompt: 'Solve: $$x + 5 = 12$$. What is $$x$$?', correctAnswer: null, widgetType: 'STANDARD_MCQ', isGraded: true, explanation: 'Subtract 5 from both sides: x = 12 - 5 = 7.', hints: ['Subtract 5 from both sides.'] } });
    await prisma.questionOption.create({ data: { questionId: linEqQ.id, optionLabel: 'A', optionText: '7', isCorrect: true } });
    await prisma.questionOption.create({ data: { questionId: linEqQ.id, optionLabel: 'B', optionText: '17', isCorrect: false } });
    await prisma.questionOption.create({ data: { questionId: linEqQ.id, optionLabel: 'C', optionText: '5', isCorrect: false } });
    await prisma.card.create({ data: { lessonId: linearEquationsLesson.id, title: 'Solve It', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Now try solving one yourself.', questionId: linEqQ.id } });
  }

  const foundationalMathPath = await prisma.learningPath.upsert({
    where: { slug: 'foundational-math' },
    update: {},
    create: {
      learningSubjectId: mathLearningSubject.id,
      title: 'Foundational Math',
      slug: 'foundational-math',
      description: 'A guided, step-by-step path from foundational algebra onward.',
      unlockMode: 'SEQUENTIAL',
      status: 'PUBLISHED',
      sortOrder: 1,
    },
  });

  await prisma.learningPathCourse.upsert({
    where: { pathId_courseId: { pathId: foundationalMathPath.id, courseId: algebraCourse.id } },
    update: {},
    create: { pathId: foundationalMathPath.id, courseId: algebraCourse.id, sortOrder: 1, isRequired: true },
  });

  console.log('✅ Seeded learning catalog');

  // ─── Module Items: Video / Reading / Discussion / Assessment variety ────────
  console.log('🌱 Seeding module items (video, reading, discussion, assessment)...');

  const practiceQuizQ = await makeQ(
    mathSubject.id,
    gradeLevel.id,
    'Solve: 3x - 4 = 11. What is x?',
    [
      { label: 'A', text: '5', correct: true },
      { label: 'B', text: '3', correct: false },
      { label: 'C', text: '25', correct: false },
    ],
    'Add 4 to both sides: 3x = 15. Divide by 3: x = 5.',
  );

  let linearEquationsPractice = await prisma.assessment.findFirst({ where: { title: 'Practice Quiz — Solving for X' } });
  if (!linearEquationsPractice) {
    linearEquationsPractice = await prisma.assessment.create({
      data: {
        assessmentTypeId: quizType.id,
        subjectId: mathSubject.id,
        classId: gradeLevel.id,
        termId: term.id,
        title: 'Practice Quiz — Solving for X',
        description: 'Low-stakes practice before the graded check-in. Attempt as many times as you like within the cap.',
        totalMarks: 10,
        estimatedDurationMinutes: 10,
        status: 'published',
        countsTowardGrade: false,
        maxAttempts: 2,
        weekNumber: 2,
        publishedAt: new Date(),
      },
    });
    const section = await prisma.assessmentSection.create({ data: { assessmentId: linearEquationsPractice.id, title: 'Section 1', sortOrder: 1 } });
    await prisma.assessmentQuestion.create({ data: { assessmentId: linearEquationsPractice.id, sectionId: section.id, questionId: practiceQuizQ.id, questionNumber: 1, marksAvailable: 10 } });
  }

  const checkInQ = await makeQ(
    mathSubject.id,
    gradeLevel.id,
    'Solve: 5x + 2 = 27. What is x?',
    [
      { label: 'A', text: '5', correct: true },
      { label: 'B', text: '29', correct: false },
      { label: 'C', text: '4', correct: false },
    ],
    'Subtract 2 from both sides: 5x = 25. Divide by 5: x = 5.',
  );

  let linearEquationsCheckIn = await prisma.assessment.findFirst({ where: { title: 'Graded Check-In — Solving for X' } });
  if (!linearEquationsCheckIn) {
    linearEquationsCheckIn = await prisma.assessment.create({
      data: {
        assessmentTypeId: quizType.id,
        subjectId: mathSubject.id,
        classId: gradeLevel.id,
        termId: term.id,
        title: 'Graded Check-In — Solving for X',
        description: 'One graded attempt to confirm you can solve linear equations on your own.',
        totalMarks: 10,
        estimatedDurationMinutes: 10,
        status: 'published',
        countsTowardGrade: true,
        maxAttempts: 1,
        weekNumber: 2,
        publishedAt: new Date(),
      },
    });
    const section = await prisma.assessmentSection.create({ data: { assessmentId: linearEquationsCheckIn.id, title: 'Section 1', sortOrder: 1 } });
    await prisma.assessmentQuestion.create({ data: { assessmentId: linearEquationsCheckIn.id, sectionId: section.id, questionId: checkInQ.id, questionNumber: 1, marksAvailable: 10 } });
  }

  const practiceChapter = await prisma.concept.upsert({
    where: { name: 'Solving Equations in Practice' },
    update: { courseId: algebraCourse.id, sortOrder: 3, kind: 'CHAPTER' },
    create: {
      name: 'Solving Equations in Practice',
      description: 'Apply what you learned about linear equations through video, reading, discussion, and quizzes.',
      courseId: algebraCourse.id,
      sortOrder: 3,
      kind: 'CHAPTER',
    },
  });

  let videoItem = await prisma.moduleItem.findFirst({ where: { conceptId: practiceChapter.id, kind: 'VIDEO' } });
  if (!videoItem) {
    videoItem = await prisma.moduleItem.create({
      data: {
        conceptId: practiceChapter.id,
        kind: 'VIDEO',
        title: 'Watch: Solving Linear Equations Walkthrough',
        sortOrder: 1,
        status: 'PUBLISHED',
        videoUrl: 'https://www.youtube.com/watch?v=Qyd_v3DGzTM',
        videoDurationSeconds: 341,
      },
    });
  }

  let readingItem = await prisma.moduleItem.findFirst({ where: { conceptId: practiceChapter.id, kind: 'READING' } });
  if (!readingItem) {
    readingItem = await prisma.moduleItem.create({
      data: {
        conceptId: practiceChapter.id,
        kind: 'READING',
        title: 'Reading: Why Balance Matters',
        sortOrder: 2,
        status: 'PUBLISHED',
        readingContent:
          "An equation like $$3x - 4 = 11$$ is a statement that both sides are equal. Whatever operation you " +
          'apply to one side, you must apply to the other — otherwise the equality breaks. This is why we add, ' +
          'subtract, multiply, or divide both sides together when isolating a variable: it keeps the scale balanced ' +
          'while peeling away everything that is not the variable itself.',
      },
    });
  }

  let discussionItem = await prisma.moduleItem.findFirst({ where: { conceptId: practiceChapter.id, kind: 'DISCUSSION' } });
  if (!discussionItem) {
    discussionItem = await prisma.moduleItem.create({
      data: {
        conceptId: practiceChapter.id,
        kind: 'DISCUSSION',
        title: 'Discuss: Real-World Equations',
        sortOrder: 3,
        status: 'PUBLISHED',
      },
    });
  }

  let discussionThread = await prisma.discussionThread.findUnique({ where: { moduleItemId: discussionItem.id } });
  if (!discussionThread) {
    discussionThread = await prisma.discussionThread.create({
      data: {
        moduleItemId: discussionItem.id,
        prompt: 'Where have you seen a linear equation used in real life? Share an example and try setting it up as an equation.',
      },
    });

    const charlotteProfileForThread = studentProfiles.find((p) => p.firstName === 'Charlotte');
    const ariaProfileForThread = studentProfiles.find((p) => p.firstName === 'Aria');
    const noahProfileForThread = studentProfiles.find((p) => p.firstName === 'Noah');

    if (charlotteProfileForThread) {
      const post1 = await prisma.discussionPost.create({
        data: {
          discussionThreadId: discussionThread.id,
          studentProfileId: charlotteProfileForThread.id,
          body: "If I have $20 and save $5 a week, the week 'w' where I hit $50 is 20 + 5w = 50!",
        },
      });
      if (ariaProfileForThread) {
        await prisma.discussionPost.create({
          data: {
            discussionThreadId: discussionThread.id,
            studentProfileId: ariaProfileForThread.id,
            parentPostId: post1.id,
            body: 'Nice example! That solves to w = 6 weeks.',
          },
        });
      }
    }
    if (noahProfileForThread) {
      await prisma.discussionPost.create({
        data: {
          discussionThreadId: discussionThread.id,
          studentProfileId: noahProfileForThread.id,
          body: 'A taxi fare of $3 plus $2 per mile is 3 + 2m = total fare — I used this to figure out how far I could go with $15.',
        },
      });
    }
  }

  let practiceQuizItem = await prisma.moduleItem.findFirst({ where: { conceptId: practiceChapter.id, assessmentId: linearEquationsPractice.id } });
  if (!practiceQuizItem) {
    practiceQuizItem = await prisma.moduleItem.create({
      data: {
        conceptId: practiceChapter.id,
        kind: 'ASSESSMENT',
        title: 'Practice Quiz: Solving for X',
        sortOrder: 4,
        status: 'PUBLISHED',
        assessmentId: linearEquationsPractice.id,
      },
    });
  }

  let checkInItem = await prisma.moduleItem.findFirst({ where: { conceptId: practiceChapter.id, assessmentId: linearEquationsCheckIn.id } });
  if (!checkInItem) {
    checkInItem = await prisma.moduleItem.create({
      data: {
        conceptId: practiceChapter.id,
        kind: 'ASSESSMENT',
        title: 'Graded Check-In: Solving for X',
        sortOrder: 5,
        status: 'PUBLISHED',
        assessmentId: linearEquationsCheckIn.id,
      },
    });
  }

  // A couple of students have already watched the video & read the reading —
  // gives the outline checkmarks and course-progress views something to show.
  for (const name of ['Charlotte', 'Aria']) {
    const profile = studentProfiles.find((p) => p.firstName === name);
    if (!profile) continue;
    for (const item of [videoItem, readingItem]) {
      const existing = await prisma.moduleItemProgress.findUnique({
        where: { moduleItemId_studentProfileId: { moduleItemId: item.id, studentProfileId: profile.id } },
      });
      if (!existing) {
        await prisma.moduleItemProgress.create({
          data: {
            moduleItemId: item.id,
            studentProfileId: profile.id,
            completedAt: new Date('2026-09-11'),
            lastPositionSeconds: item.kind === 'VIDEO' ? item.videoDurationSeconds ?? undefined : undefined,
          },
        });
      }
    }
  }

  // Assign the two new quizzes to a few students so the "Start assignment"
  // path in AssessmentItemView resolves to a real assignment for their login.
  for (const name of ['Charlotte', 'Aria', 'Noah']) {
    const profile = studentProfiles.find((p) => p.firstName === name);
    if (!profile) continue;
    for (const assessment of [linearEquationsPractice, linearEquationsCheckIn]) {
      const existingAssignment = await prisma.assessmentAssignment.findFirst({
        where: { assessmentId: assessment.id, studentProfileId: profile.id },
      });
      if (!existingAssignment) {
        await prisma.assessmentAssignment.create({
          data: {
            assessmentId: assessment.id,
            studentProfileId: profile.id,
            assignedByUserId: superAdminUser.id,
            opensAt,
            dueAt,
            status: 'assigned',
          },
        });
      }
    }
  }

  console.log('✅ Seeded module items (video, reading, discussion, assessment)');

  // ─── Checkpoint Concept ───────────────────────────────────────────────────────
  console.log('🌱 Seeding checkpoint chapter...');

  const checkpointChapter = await prisma.concept.upsert({
    where: { name: 'Algebra Foundations Checkpoint' },
    update: { courseId: algebraCourse.id, sortOrder: 4, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: {
      name: 'Algebra Foundations Checkpoint',
      description: 'A short checkpoint quiz covering variables and linear equations — pass at 70% or better on the first try to complete this chapter.',
      courseId: algebraCourse.id,
      sortOrder: 4,
      kind: 'CHECKPOINT',
      passThresholdPercent: 70,
    },
  });

  let checkpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Algebra Foundations', conceptId: checkpointChapter.id } });
  if (!checkpointLesson) {
    checkpointLesson = await prisma.lesson.create({
      data: {
        conceptId: checkpointChapter.id,
        title: 'Checkpoint: Algebra Foundations',
        description: 'Confirm your understanding of variables, expressions, and solving linear equations.',
        sortOrder: 1,
        xpReward: 75,
      },
    });
    await prisma.card.create({
      data: {
        lessonId: checkpointLesson.id,
        title: 'Before You Start',
        sortOrder: 1,
        cardType: 'CONCEPTUAL',
        content: "This checkpoint checks first-try accuracy — retries won't count toward passing, so take your time on the question ahead.",
      },
    });
    const checkpointQ = await makeQ(
      mathSubject.id,
      gradeLevel.id,
      'Solve: 4x + 3 = 19. What is x?',
      [
        { label: 'A', text: '4', correct: true },
        { label: 'B', text: '5.5', correct: false },
        { label: 'C', text: '16', correct: false },
      ],
      'Subtract 3 from both sides: 4x = 16. Divide by 4: x = 4.',
    );
    await prisma.card.create({
      data: {
        lessonId: checkpointLesson.id,
        title: 'Checkpoint Question',
        sortOrder: 2,
        cardType: 'CHECKPOINT',
        content: 'Solve this on your own, no hints — this is what determines whether you pass.',
        questionId: checkpointQ.id,
      },
    });
  }

  console.log('✅ Seeded checkpoint chapter');

  // ─── Phase 3.5: Practice-chapter recap lesson ────────────────────────────────
  // computeConceptDoneMap requires concept.lessons.length > 0 — practiceChapter
  // had none (module items only), so its CHECKPOINT sibling could never
  // actually become unlockable. One short lesson fixes that without touching
  // progression logic.
  console.log('🌱 Seeding practice recap lesson...');
  let practiceRecapLesson = await prisma.lesson.findFirst({ where: { title: 'Practice Recap', conceptId: practiceChapter.id } });
  if (!practiceRecapLesson) {
    practiceRecapLesson = await prisma.lesson.create({ data: { conceptId: practiceChapter.id, title: 'Practice Recap', description: 'A short recap tying together the video, reading, and discussion above.', sortOrder: 6, xpReward: 20 } });
    await prisma.card.create({ data: { lessonId: practiceRecapLesson.id, title: 'Recap', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'You just watched a walkthrough, read about why balance matters, and discussed a real-world equation. Ready for the checkpoint next.' } });
  }
  console.log('✅ Seeded practice recap lesson');

  // ─── Phase 3.5: Additional courses ────────────────────────────────────────────
  console.log('🌱 Seeding Phase 3.5 courses...');

  const sciLearningSubject = await prisma.learningSubject.upsert({
    where: { code: 'SCI' },
    update: {},
    create: { code: 'SCI', name: 'Science & Discovery', description: 'Shapes, measuring, patterns and how the world works.', sortOrder: 2 },
  });

  // Course: Fractions & Algebra Basics — reparents the two orphaned legacy
  // Concepts ('Fractions', 'Algebra Fundamentals') that already had real
  // lesson content but were never attached to any Course.
  const fractionsCourse = await prisma.course.upsert({
    where: { slug: 'fractions-and-algebra-basics' },
    update: { gradeBand: 'G5_6' },
    create: {
      learningSubjectId: mathLearningSubject.id,
      title: 'Fractions & Algebra Basics',
      slug: 'fractions-and-algebra-basics',
      description: 'Compare and combine fractions, then take your first steps into algebraic thinking.',
      estimatedHours: 6,
      status: 'PUBLISHED',
      sortOrder: 2,
      gradeBand: 'G5_6',
    },
  });

  await prisma.concept.update({ where: { id: fractionsConc.id }, data: { courseId: fractionsCourse.id, sortOrder: 1, kind: 'CHAPTER' } });
  await prisma.concept.update({ where: { id: algebraConc.id }, data: { courseId: fractionsCourse.id, sortOrder: 2, kind: 'CHAPTER' } });

  const fractionsPracticeChapter = await prisma.concept.upsert({
    where: { name: 'Fractions & Algebra in Practice' },
    update: { courseId: fractionsCourse.id, sortOrder: 3, kind: 'CHAPTER' },
    create: {
      name: 'Fractions & Algebra in Practice',
      description: 'Apply what you learned through video, reading, discussion, and a practice quiz.',
      courseId: fractionsCourse.id,
      sortOrder: 3,
      kind: 'CHAPTER',
    },
  });

  let fracPracticeLesson = await prisma.lesson.findFirst({ where: { title: 'Fractions Recap', conceptId: fractionsPracticeChapter.id } });
  if (!fracPracticeLesson) {
    fracPracticeLesson = await prisma.lesson.create({ data: { conceptId: fractionsPracticeChapter.id, title: 'Fractions Recap', description: 'Tying fractions and algebra together with one more example.', sortOrder: 1, xpReward: 40 } });
    const fracQ = await makeQ(mathSubject.id, gradeLevel.id, 'A recipe needs 3/4 cup of sugar. If you double the recipe, how much sugar do you need?', [{ label: 'A', text: '1 1/2 cups', correct: true }, { label: 'B', text: '3/8 cup', correct: false }, { label: 'C', text: '1 1/4 cups', correct: false }], 'Doubling 3/4 gives 6/4, which simplifies to 1 1/2 cups.');
    await prisma.card.create({ data: { lessonId: fracPracticeLesson.id, title: 'Doubling a Recipe', sortOrder: 1, cardType: 'INTERACTIVE', content: 'Fractions show up constantly in everyday cooking.', questionId: fracQ.id } });
  }

  let fracVideoItem = await prisma.moduleItem.findFirst({ where: { conceptId: fractionsPracticeChapter.id, kind: 'VIDEO' } });
  if (!fracVideoItem) {
    fracVideoItem = await prisma.moduleItem.create({ data: { conceptId: fractionsPracticeChapter.id, kind: 'VIDEO', title: 'Watch: Fractions in Everyday Life', sortOrder: 2, status: 'PUBLISHED', videoUrl: 'https://www.youtube.com/watch?v=1TSF2ihoSaU', videoDurationSeconds: 300 } });
  }

  let fracReadingItem = await prisma.moduleItem.findFirst({ where: { conceptId: fractionsPracticeChapter.id, kind: 'READING' } });
  if (!fracReadingItem) {
    fracReadingItem = await prisma.moduleItem.create({ data: { conceptId: fractionsPracticeChapter.id, kind: 'READING', title: 'Reading: Common Denominators', sortOrder: 3, status: 'PUBLISHED', readingContent: 'To add or compare fractions with different denominators, first rewrite them with a common denominator — the least common multiple of the two denominators. Once the denominators match, you can add, subtract, or compare the numerators directly.' } });
  }

  let fracDiscussionItem = await prisma.moduleItem.findFirst({ where: { conceptId: fractionsPracticeChapter.id, kind: 'DISCUSSION' } });
  if (!fracDiscussionItem) {
    fracDiscussionItem = await prisma.moduleItem.create({ data: { conceptId: fractionsPracticeChapter.id, kind: 'DISCUSSION', title: 'Discuss: Fractions You Use Daily', sortOrder: 4, status: 'PUBLISHED' } });
    const fracThread = await prisma.discussionThread.create({ data: { moduleItemId: fracDiscussionItem.id, prompt: 'Where do you use fractions in everyday life — cooking, sports, money? Share an example.' } });
    if (charlotteProfile) {
      await prisma.discussionPost.create({ data: { discussionThreadId: fracThread.id, studentProfileId: charlotteProfile.id, body: "When I split a pizza with 3 friends, we each get 1/4 — that's a fraction I use all the time!" } });
    }
  }

  const fracQuizQ = await makeQ(mathSubject.id, gradeLevel.id, 'What is 1/3 + 1/6?', [{ label: 'A', text: '1/2', correct: true }, { label: 'B', text: '2/9', correct: false }, { label: 'C', text: '1/9', correct: false }], 'Rewrite 1/3 as 2/6. Then 2/6 + 1/6 = 3/6 = 1/2.');
  let fracQuiz = await prisma.assessment.findFirst({ where: { title: 'Practice Quiz — Fractions & Algebra' } });
  if (!fracQuiz) {
    fracQuiz = await prisma.assessment.create({ data: { assessmentTypeId: quizType.id, subjectId: mathSubject.id, classId: gradeLevel.id, termId: term.id, title: 'Practice Quiz — Fractions & Algebra', description: 'Low-stakes practice on fractions and basic algebra.', totalMarks: 10, estimatedDurationMinutes: 10, status: 'published', countsTowardGrade: false, maxAttempts: 2, weekNumber: 2, publishedAt: new Date() } });
    const fracSection = await prisma.assessmentSection.create({ data: { assessmentId: fracQuiz.id, title: 'Section 1', sortOrder: 1 } });
    await prisma.assessmentQuestion.create({ data: { assessmentId: fracQuiz.id, sectionId: fracSection.id, questionId: fracQuizQ.id, questionNumber: 1, marksAvailable: 10 } });
  }
  let fracAssessmentItem = await prisma.moduleItem.findFirst({ where: { conceptId: fractionsPracticeChapter.id, assessmentId: fracQuiz.id } });
  if (!fracAssessmentItem) {
    fracAssessmentItem = await prisma.moduleItem.create({ data: { conceptId: fractionsPracticeChapter.id, kind: 'ASSESSMENT', title: 'Practice Quiz: Fractions & Algebra', sortOrder: 5, status: 'PUBLISHED', assessmentId: fracQuiz.id } });
  }
  if (charlotteProfile) {
    const existingFracAssignment = await prisma.assessmentAssignment.findFirst({ where: { assessmentId: fracQuiz.id, studentProfileId: charlotteProfile.id } });
    if (!existingFracAssignment) {
      await prisma.assessmentAssignment.create({ data: { assessmentId: fracQuiz.id, studentProfileId: charlotteProfile.id, assignedByUserId: superAdminUser.id, opensAt, dueAt, status: 'assigned' } });
    }
  }

  const fractionsCheckpoint = await prisma.concept.upsert({
    where: { name: 'Fractions & Algebra Checkpoint' },
    update: { courseId: fractionsCourse.id, sortOrder: 4, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: { name: 'Fractions & Algebra Checkpoint', description: 'A short checkpoint covering fractions and basic algebra — pass at 70% or better on the first try.', courseId: fractionsCourse.id, sortOrder: 4, kind: 'CHECKPOINT', passThresholdPercent: 70 },
  });
  let fracCheckpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Fractions & Algebra', conceptId: fractionsCheckpoint.id } });
  if (!fracCheckpointLesson) {
    fracCheckpointLesson = await prisma.lesson.create({ data: { conceptId: fractionsCheckpoint.id, title: 'Checkpoint: Fractions & Algebra', description: 'Confirm your understanding of fractions and basic algebra.', sortOrder: 1, xpReward: 70 } });
    await prisma.card.create({ data: { lessonId: fracCheckpointLesson.id, title: 'Before You Start', sortOrder: 1, cardType: 'CONCEPTUAL', content: "This checkpoint checks first-try accuracy — retries won't count toward passing." } });
    const fracCheckpointQ = await makeQ(mathSubject.id, gradeLevel.id, 'What is 2/5 + 1/5?', [{ label: 'A', text: '3/5', correct: true }, { label: 'B', text: '3/10', correct: false }, { label: 'C', text: '2/25', correct: false }], 'Same denominator: add numerators. 2/5 + 1/5 = 3/5.');
    await prisma.card.create({ data: { lessonId: fracCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 2, cardType: 'CHECKPOINT', content: 'Solve this on your own, no hints.', questionId: fracCheckpointQ.id } });
  }


  console.log('✅ Seeded Phase 3.5 courses');

  // ─── Content expansion: Percentages & Ratios (Math) ───────────────────────────
  // A new, standalone course — widens the existing Math subject rather than
  // touching algebra-foundations/fractions-and-algebra-basics' already-tested
  // chapter sequences. Widget mix: STANDARD_MCQ, SLIDER_MANIPULATIVE,
  // GRID_MATCHING. Module items: VIDEO, READING, DISCUSSION, ASSESSMENT.
  console.log('🌱 Seeding Percentages & Ratios course...');

  const percentCourse = await prisma.course.upsert({
    where: { slug: 'percentages-and-ratios' },
    update: {},
    create: {
      learningSubjectId: mathLearningSubject.id,
      title: 'Percentages & Ratios',
      slug: 'percentages-and-ratios',
      description: 'Understand percentages, simplify ratios, and see how they connect to fractions.',
      estimatedHours: 5,
      status: 'PUBLISHED',
      sortOrder: 4,
      gradeBand: 'G5_6',
    },
  });

  const percentChapter = await prisma.concept.upsert({
    where: { name: 'Understanding Percentages' },
    update: { courseId: percentCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Understanding Percentages', description: 'What a percent means and how to calculate one.', courseId: percentCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let percentIntroLesson = await prisma.lesson.findFirst({ where: { title: 'What is a Percent?', conceptId: percentChapter.id } });
  if (!percentIntroLesson) {
    percentIntroLesson = await prisma.lesson.create({ data: { conceptId: percentChapter.id, title: 'What is a Percent?', description: 'A percent is a fraction out of 100.', sortOrder: 1, xpReward: 40 } });
    await prisma.card.create({ data: { lessonId: percentIntroLesson.id, title: 'Out of 100', sortOrder: 1, cardType: 'CONCEPTUAL', content: '"Percent" means "out of 100." 50% is the same as 50/100, or 1/2.' } });
    const pctQ1 = await makeQ(mathSubject.id, gradeLevel.id, 'What is 25% of 80?', [{ label: 'A', text: '20', correct: true }, { label: 'B', text: '25', correct: false }, { label: 'C', text: '15', correct: false }, { label: 'D', text: '40', correct: false }], '25% = 1/4. 80 ÷ 4 = 20.');
    await prisma.card.create({ data: { lessonId: percentIntroLesson.id, title: 'Find the Percent', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Work it out, then pick your answer.', questionId: pctQ1.id } });
    const pctQ2 = await makeQ(mathSubject.id, gradeLevel.id, 'What is 10% of 250?', [{ label: 'A', text: '25', correct: true }, { label: 'B', text: '10', correct: false }, { label: 'C', text: '50', correct: false }], '10% means dividing by 10. 250 ÷ 10 = 25.');
    await prisma.card.create({ data: { lessonId: percentIntroLesson.id, title: 'Find the Percent', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Work it out, then pick your answer.', questionId: pctQ2.id } });
  }

  let percentSliderLesson = await prisma.lesson.findFirst({ where: { title: 'Percent on a Scale', conceptId: percentChapter.id } });
  if (!percentSliderLesson) {
    percentSliderLesson = await prisma.lesson.create({ data: { conceptId: percentChapter.id, title: 'Percent on a Scale', description: 'Slide to find the right percentage.', sortOrder: 2, xpReward: 35 } });
    await prisma.card.create({ data: { lessonId: percentSliderLesson.id, title: 'Percent as a Scale', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A percent scale runs from 0 to 100 — think of it like a dial you can slide.' } });
    const sliderQ = await prisma.question.create({
      data: {
        subjectId: mathSubject.id,
        classId: gradeLevel.id,
        questionType: 'interactive',
        prompt: 'A shirt is on sale for 30% off. Slide to show 30%.',
        correctAnswer: '30',
        widgetType: 'SLIDER_MANIPULATIVE',
        isGraded: true,
        explanation: '30% off means the discount is 30 out of 100.',
        hints: ['Slide until the number reads 30.'],
        widgetConfig: { min: 0, max: 100, step: 5, unit: '%' },
      },
    });
    await prisma.card.create({ data: { lessonId: percentSliderLesson.id, title: 'Set the Discount', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Move the slider to 30%.', questionId: sliderQ.id } });
  }

  const ratioChapter = await prisma.concept.upsert({
    where: { name: 'Ratios and Proportions' },
    update: { courseId: percentCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Ratios and Proportions', description: 'Comparing quantities and simplifying ratios.', courseId: percentCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let ratioIntroLesson = await prisma.lesson.findFirst({ where: { title: 'Simplifying Ratios', conceptId: ratioChapter.id } });
  if (!ratioIntroLesson) {
    ratioIntroLesson = await prisma.lesson.create({ data: { conceptId: ratioChapter.id, title: 'Simplifying Ratios', description: 'Write a ratio in its simplest form.', sortOrder: 1, xpReward: 40 } });
    await prisma.card.create({ data: { lessonId: ratioIntroLesson.id, title: 'Comparing Amounts', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A ratio compares two amounts, like 4 apples to 2 oranges — written 4:2, which simplifies to 2:1.' } });
    const ratioQ = await makeQ(mathSubject.id, gradeLevel.id, 'Simplify the ratio 8:12.', [{ label: 'A', text: '2:3', correct: true }, { label: 'B', text: '4:6', correct: false }, { label: 'C', text: '1:2', correct: false }], 'Divide both sides by their greatest common factor, 4: 8÷4 : 12÷4 = 2:3.');
    await prisma.card.create({ data: { lessonId: ratioIntroLesson.id, title: 'Simplify It', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Reduce the ratio to its simplest form.', questionId: ratioQ.id } });
  }

  let ratioMatchLesson = await prisma.lesson.findFirst({ where: { title: 'Match Ratios to Simplest Form', conceptId: ratioChapter.id } });
  if (!ratioMatchLesson) {
    ratioMatchLesson = await prisma.lesson.create({ data: { conceptId: ratioChapter.id, title: 'Match Ratios to Simplest Form', description: 'Match each ratio to its simplified version.', sortOrder: 2, xpReward: 40 } });
    await prisma.card.create({ data: { lessonId: ratioMatchLesson.id, title: 'Match Them Up', sortOrder: 1, cardType: 'CONCEPTUAL', content: "Let's practice matching ratios to their simplest form." } });
    const ratioMatchQ = await prisma.question.create({
      data: {
        subjectId: mathSubject.id,
        classId: gradeLevel.id,
        questionType: 'interactive',
        prompt: 'Match each ratio to its simplest form.',
        correctAnswer: null,
        widgetType: 'GRID_MATCHING',
        isGraded: true,
        explanation: '6:9 = 2:3, 10:5 = 2:1, 9:12 = 3:4.',
        hints: ['Divide both sides of each ratio by their greatest common factor.'],
        widgetConfig: {
          left: [
            { id: 'r1', text: '6:9' },
            { id: 'r2', text: '10:5' },
            { id: 'r3', text: '9:12' },
          ],
          right: [
            { id: 's1', text: '2:3' },
            { id: 's2', text: '2:1' },
            { id: 's3', text: '3:4' },
          ],
          correctPairs: [['r1', 's1'], ['r2', 's2'], ['r3', 's3']],
        },
      },
    });
    await prisma.card.create({ data: { lessonId: ratioMatchLesson.id, title: 'Match Them Up', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap a ratio, then tap its simplest form.', questionId: ratioMatchQ.id } });
  }

  const percentPracticeChapter = await prisma.concept.upsert({
    where: { name: 'Percentages & Ratios in Practice' },
    update: { courseId: percentCourse.id, sortOrder: 3, kind: 'CHAPTER' },
    create: { name: 'Percentages & Ratios in Practice', description: 'Apply what you learned through video, reading, discussion, and a practice quiz.', courseId: percentCourse.id, sortOrder: 3, kind: 'CHAPTER' },
  });

  let percentRecapLesson = await prisma.lesson.findFirst({ where: { title: 'Percentages Everywhere', conceptId: percentPracticeChapter.id } });
  if (!percentRecapLesson) {
    percentRecapLesson = await prisma.lesson.create({ data: { conceptId: percentPracticeChapter.id, title: 'Percentages Everywhere', description: 'Where percentages and ratios show up in real life.', sortOrder: 1, xpReward: 30 } });
    await prisma.card.create({ data: { lessonId: percentRecapLesson.id, title: 'Real-World Percentages', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Sales tax, discounts, sports statistics, and recipe scaling all use percentages and ratios.' } });
  }

  let percentVideoItem = await prisma.moduleItem.findFirst({ where: { conceptId: percentPracticeChapter.id, kind: 'VIDEO' } });
  if (!percentVideoItem) {
    percentVideoItem = await prisma.moduleItem.create({ data: { conceptId: percentPracticeChapter.id, kind: 'VIDEO', title: 'Watch: Percentages in Real Life', sortOrder: 2, status: 'PUBLISHED', videoUrl: 'https://www.youtube.com/watch?v=JeVSmq1Nrpw', videoDurationSeconds: 264 } });
  }

  let percentReadingItem = await prisma.moduleItem.findFirst({ where: { conceptId: percentPracticeChapter.id, kind: 'READING' } });
  if (!percentReadingItem) {
    percentReadingItem = await prisma.moduleItem.create({ data: { conceptId: percentPracticeChapter.id, kind: 'READING', title: 'Reading: Percentages vs. Ratios', sortOrder: 3, status: 'PUBLISHED', readingContent: 'A percentage always compares a quantity to 100, while a ratio can compare any two quantities directly. Every percentage can be written as a ratio to 100 (like 30% = 30:100), but not every ratio is a percentage.' } });
  }

  let percentDiscussionItem = await prisma.moduleItem.findFirst({ where: { conceptId: percentPracticeChapter.id, kind: 'DISCUSSION' } });
  if (!percentDiscussionItem) {
    percentDiscussionItem = await prisma.moduleItem.create({ data: { conceptId: percentPracticeChapter.id, kind: 'DISCUSSION', title: 'Discuss: Percentages You See Daily', sortOrder: 4, status: 'PUBLISHED' } });
    const percentThread = await prisma.discussionThread.create({ data: { moduleItemId: percentDiscussionItem.id, prompt: 'Where do you see percentages in everyday life — sales, weather, grades? Share an example.' } });
    if (charlotteProfile) {
      await prisma.discussionPost.create({ data: { discussionThreadId: percentThread.id, studentProfileId: charlotteProfile.id, body: 'My weather app shows a percent chance of rain every morning — that\'s a percentage I check every day!' } });
    }
  }

  const percentQuizQ = await makeQ(mathSubject.id, gradeLevel.id, 'What is 50% of 40?', [{ label: 'A', text: '20', correct: true }, { label: 'B', text: '25', correct: false }, { label: 'C', text: '10', correct: false }], '50% is half. 40 ÷ 2 = 20.');
  let percentQuiz = await prisma.assessment.findFirst({ where: { title: 'Practice Quiz — Percentages & Ratios' } });
  if (!percentQuiz) {
    percentQuiz = await prisma.assessment.create({ data: { assessmentTypeId: quizType.id, subjectId: mathSubject.id, classId: gradeLevel.id, termId: term.id, title: 'Practice Quiz — Percentages & Ratios', description: 'Low-stakes practice on percentages and ratios.', totalMarks: 10, estimatedDurationMinutes: 10, status: 'published', countsTowardGrade: false, maxAttempts: 2, weekNumber: 3, publishedAt: new Date() } });
    const percentSection = await prisma.assessmentSection.create({ data: { assessmentId: percentQuiz.id, title: 'Section 1', sortOrder: 1 } });
    await prisma.assessmentQuestion.create({ data: { assessmentId: percentQuiz.id, sectionId: percentSection.id, questionId: percentQuizQ.id, questionNumber: 1, marksAvailable: 10 } });
  }
  let percentAssessmentItem = await prisma.moduleItem.findFirst({ where: { conceptId: percentPracticeChapter.id, assessmentId: percentQuiz.id } });
  if (!percentAssessmentItem) {
    percentAssessmentItem = await prisma.moduleItem.create({ data: { conceptId: percentPracticeChapter.id, kind: 'ASSESSMENT', title: 'Practice Quiz: Percentages & Ratios', sortOrder: 5, status: 'PUBLISHED', assessmentId: percentQuiz.id } });
  }
  if (charlotteProfile) {
    const existingPercentAssignment = await prisma.assessmentAssignment.findFirst({ where: { assessmentId: percentQuiz.id, studentProfileId: charlotteProfile.id } });
    if (!existingPercentAssignment) {
      await prisma.assessmentAssignment.create({ data: { assessmentId: percentQuiz.id, studentProfileId: charlotteProfile.id, assignedByUserId: superAdminUser.id, opensAt, dueAt, status: 'assigned' } });
    }
  }

  const percentCheckpoint = await prisma.concept.upsert({
    where: { name: 'Percentages & Ratios Checkpoint' },
    update: { courseId: percentCourse.id, sortOrder: 4, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: { name: 'Percentages & Ratios Checkpoint', description: 'A short checkpoint on percentages and ratios — pass at 70% or better on the first try.', courseId: percentCourse.id, sortOrder: 4, kind: 'CHECKPOINT', passThresholdPercent: 70 },
  });
  let percentCheckpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Percentages & Ratios', conceptId: percentCheckpoint.id } });
  if (!percentCheckpointLesson) {
    percentCheckpointLesson = await prisma.lesson.create({ data: { conceptId: percentCheckpoint.id, title: 'Checkpoint: Percentages & Ratios', description: 'Confirm your understanding of percentages and ratios.', sortOrder: 1, xpReward: 80 } });
    await prisma.card.create({ data: { lessonId: percentCheckpointLesson.id, title: 'Before You Start', sortOrder: 1, cardType: 'CONCEPTUAL', content: "This checkpoint checks first-try accuracy — retries won't count toward passing." } });
    const percentCheckpointQ = await makeQ(mathSubject.id, gradeLevel.id, 'Simplify the ratio 12:18.', [{ label: 'A', text: '2:3', correct: true }, { label: 'B', text: '3:2', correct: false }, { label: 'C', text: '6:9', correct: false }], 'Divide both sides by 6: 12÷6 : 18÷6 = 2:3.');
    await prisma.card.create({ data: { lessonId: percentCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 2, cardType: 'CHECKPOINT', content: 'Solve this on your own, no hints.', questionId: percentCheckpointQ.id } });
  }

  console.log('✅ Seeded Percentages & Ratios course');

  // ─── K-6 pilot: Pre-K/K Language Arts ─────────────────────────────────────────
  // Narrowest possible slice of the K-6 curriculum-expansion plan — alphabet
  // recognition + letter sounds only, built entirely from widget types that
  // already render on mobile today (STANDARD_MCQ, GRID_MATCHING). Letter
  // tracing is explicitly out of scope for this pilot (see the plan doc);
  // this course exists to validate grade-band tagging, mastery gating, and
  // full-prompt narration on genuinely early-literacy content before any of
  // that is extended to other grade bands or subjects.
  console.log('🌱 Seeding K-6 pilot course (Pre-K/K Language Arts)...');

  const laLearningSubject = await prisma.learningSubject.upsert({
    where: { code: 'LA' },
    update: {},
    create: { code: 'LA', name: 'Language Arts', description: 'Reading, phonics, and writing.', sortOrder: 3 },
  });

  const alphabetCourse = await prisma.course.upsert({
    where: { slug: 'alphabet-and-phonics-basics' },
    update: { gradeBand: 'PRE_K_K', sortOrder: -1 },
    create: {
      learningSubjectId: laLearningSubject.id,
      title: 'Alphabet & Phonics Basics',
      slug: 'alphabet-and-phonics-basics',
      description: 'Learn to recognize letters and the sounds they make.',
      estimatedHours: 2,
      status: 'PUBLISHED',
      // Negative on purpose: two leftover authoring-UI test courses ("TEst",
      // "test-1") sit at the default sortOrder 0 and were winning
      // `courses?.[0]` — the mobile home screen's naive "Keep learning" pick
      // — ahead of every real course, including the existing Algebra one.
      // This wins that slot for actual testable content instead of junk.
      sortOrder: -1,
      gradeBand: 'PRE_K_K',
    },
  });

  const letterRecognitionChapter = await prisma.concept.upsert({
    where: { name: 'Letter Recognition' },
    update: { courseId: alphabetCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Letter Recognition', description: 'Spotting uppercase and lowercase letters.', courseId: alphabetCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let uppercaseLesson = await prisma.lesson.findFirst({ where: { title: 'Uppercase Letters', conceptId: letterRecognitionChapter.id } });
  if (!uppercaseLesson) {
    uppercaseLesson = await prisma.lesson.create({ data: { conceptId: letterRecognitionChapter.id, title: 'Uppercase Letters', description: "Let's learn to spot uppercase letters!", sortOrder: 1, xpReward: 20 } });
    await prisma.card.create({ data: { lessonId: uppercaseLesson.id, title: 'Big Letters', sortOrder: 1, cardType: 'CONCEPTUAL', content: "Let's learn to spot uppercase letters!" } });
    const upperQ1 = await makeQ(engSubject.id, kLevel.id, 'Which letter is B?', [{ label: 'A', text: 'B', correct: true }, { label: 'B', text: 'D', correct: false }, { label: 'C', text: 'P', correct: false }, { label: 'D', text: 'R', correct: false }], "B has one straight line and two bumps on the right.");
    await prisma.card.create({ data: { lessonId: uppercaseLesson.id, title: 'Find the Letter', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap the letter shown below.', questionId: upperQ1.id } });
    const upperQ2 = await makeQ(engSubject.id, kLevel.id, 'Which letter is M?', [{ label: 'A', text: 'M', correct: true }, { label: 'B', text: 'N', correct: false }, { label: 'C', text: 'W', correct: false }, { label: 'D', text: 'H', correct: false }], 'M has two peaks that point up.');
    await prisma.card.create({ data: { lessonId: uppercaseLesson.id, title: 'Find the Letter', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Tap the letter shown below.', questionId: upperQ2.id } });
  }

  let lowercaseLesson = await prisma.lesson.findFirst({ where: { title: 'Lowercase Letters', conceptId: letterRecognitionChapter.id } });
  if (!lowercaseLesson) {
    lowercaseLesson = await prisma.lesson.create({ data: { conceptId: letterRecognitionChapter.id, title: 'Lowercase Letters', description: 'Now practice lowercase letters.', sortOrder: 2, xpReward: 20 } });
    await prisma.card.create({ data: { lessonId: lowercaseLesson.id, title: 'Small Letters', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Now practice lowercase letters.' } });
    const lowerQ1 = await makeQ(engSubject.id, kLevel.id, 'Which letter is b?', [{ label: 'A', text: 'b', correct: true }, { label: 'B', text: 'd', correct: false }, { label: 'C', text: 'p', correct: false }, { label: 'D', text: 'q', correct: false }], "b's circle is on the bottom-right of a tall line.");
    await prisma.card.create({ data: { lessonId: lowercaseLesson.id, title: 'Find the Letter', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap the letter shown below.', questionId: lowerQ1.id } });
    const lowerQ2 = await makeQ(engSubject.id, kLevel.id, 'Which letter is m?', [{ label: 'A', text: 'm', correct: true }, { label: 'B', text: 'n', correct: false }, { label: 'C', text: 'w', correct: false }, { label: 'D', text: 'u', correct: false }], 'm has two little bumps in a row.');
    await prisma.card.create({ data: { lessonId: lowercaseLesson.id, title: 'Find the Letter', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Tap the letter shown below.', questionId: lowerQ2.id } });
  }

  const letterSoundsChapter = await prisma.concept.upsert({
    where: { name: 'Letter Sounds' },
    update: { courseId: alphabetCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Letter Sounds', description: 'Matching letters to the sounds they make.', courseId: alphabetCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let beginningSoundsLesson = await prisma.lesson.findFirst({ where: { title: 'Beginning Sounds', conceptId: letterSoundsChapter.id } });
  if (!beginningSoundsLesson) {
    beginningSoundsLesson = await prisma.lesson.create({ data: { conceptId: letterSoundsChapter.id, title: 'Beginning Sounds', description: 'Every letter makes a sound.', sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: beginningSoundsLesson.id, title: 'Letters Make Sounds', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Every letter makes a sound. Listen and pick the right one!' } });
    const soundQ1 = await makeQ(engSubject.id, kLevel.id, "Which letter makes the 'buh' sound?", [{ label: 'A', text: 'B', correct: true }, { label: 'B', text: 'D', correct: false }, { label: 'C', text: 'P', correct: false }, { label: 'D', text: 'T', correct: false }], "B makes the 'buh' sound, like in 'ball'.");
    await prisma.card.create({ data: { lessonId: beginningSoundsLesson.id, title: 'Pick the Sound', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Listen carefully, then tap the letter.', questionId: soundQ1.id } });
    const soundQ2 = await makeQ(engSubject.id, kLevel.id, "Which letter makes the 'sss' sound?", [{ label: 'A', text: 'S', correct: true }, { label: 'B', text: 'C', correct: false }, { label: 'C', text: 'Z', correct: false }, { label: 'D', text: 'F', correct: false }], "S makes the 'sss' sound, like in 'sun'.");
    await prisma.card.create({ data: { lessonId: beginningSoundsLesson.id, title: 'Pick the Sound', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Listen carefully, then tap the letter.', questionId: soundQ2.id } });
  }

  let matchSoundsLesson = await prisma.lesson.findFirst({ where: { title: 'Match Letters to Sounds', conceptId: letterSoundsChapter.id } });
  if (!matchSoundsLesson) {
    matchSoundsLesson = await prisma.lesson.create({ data: { conceptId: letterSoundsChapter.id, title: 'Match Letters to Sounds', description: 'Match each letter to its sound.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: matchSoundsLesson.id, title: 'Match Them Up', sortOrder: 1, cardType: 'CONCEPTUAL', content: "Let's match letters to their sounds." } });
    const matchQ = await prisma.question.create({
      data: {
        subjectId: engSubject.id,
        classId: kLevel.id,
        questionType: 'interactive',
        prompt: 'Match each letter to the sound it makes.',
        correctAnswer: null,
        widgetType: 'GRID_MATCHING',
        isGraded: true,
        explanation: "B says 'buh', M says 'muh', S says 'sss', T says 'tuh'.",
        hints: ['Say each letter out loud and listen to the sound it starts with.'],
        widgetConfig: {
          left: [
            { id: 'b', text: 'B' },
            { id: 'm', text: 'M' },
            { id: 's', text: 'S' },
            { id: 't', text: 'T' },
          ],
          right: [
            { id: 'buh', text: "'buh'" },
            { id: 'muh', text: "'muh'" },
            { id: 'sss', text: "'sss'" },
            { id: 'tuh', text: "'tuh'" },
          ],
          correctPairs: [['b', 'buh'], ['m', 'muh'], ['s', 'sss'], ['t', 'tuh']],
        },
      },
    });
    await prisma.card.create({ data: { lessonId: matchSoundsLesson.id, title: 'Match Them Up', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap a letter, then tap its matching sound.', questionId: matchQ.id } });
  }

  const alphabetCheckpoint = await prisma.concept.upsert({
    where: { name: 'Alphabet & Phonics Checkpoint' },
    update: { courseId: alphabetCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: { name: 'Alphabet & Phonics Checkpoint', description: 'A short checkpoint on letters and sounds — pass at 70% or better on the first try.', courseId: alphabetCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
  });
  let alphabetCheckpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Alphabet & Phonics', conceptId: alphabetCheckpoint.id } });
  if (!alphabetCheckpointLesson) {
    alphabetCheckpointLesson = await prisma.lesson.create({ data: { conceptId: alphabetCheckpoint.id, title: 'Checkpoint: Alphabet & Phonics', description: "Let's see what you've learned!", sortOrder: 1, xpReward: 50 } });
    await prisma.card.create({ data: { lessonId: alphabetCheckpointLesson.id, title: 'Before You Start', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Do your best! Listen carefully to each question.' } });
    const checkpointQ1 = await makeQ(engSubject.id, kLevel.id, "Which letter makes the 'muh' sound?", [{ label: 'A', text: 'M', correct: true }, { label: 'B', text: 'N', correct: false }, { label: 'C', text: 'W', correct: false }, { label: 'D', text: 'B', correct: false }], "M makes the 'muh' sound, like in 'moon'.");
    await prisma.card.create({ data: { lessonId: alphabetCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 2, cardType: 'CHECKPOINT', content: 'Listen carefully, then tap the letter.', questionId: checkpointQ1.id } });
    const checkpointQ2 = await makeQ(engSubject.id, kLevel.id, 'Which one is lowercase d?', [{ label: 'A', text: 'd', correct: true }, { label: 'B', text: 'b', correct: false }, { label: 'C', text: 'p', correct: false }, { label: 'D', text: 'q', correct: false }], "d's circle is on the bottom-left of a tall line.");
    await prisma.card.create({ data: { lessonId: alphabetCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 3, cardType: 'CHECKPOINT', content: 'Tap the letter shown below.', questionId: checkpointQ2.id } });
  }

  console.log('✅ Seeded K-6 pilot course');

  // ─── K-6 expansion: Pre-K/K Math ──────────────────────────────────────────
  // Second grade-band pilot slice, same widget-type constraint as the
  // Language Arts pilot above (STANDARD_MCQ + GRID_MATCHING only — no images,
  // no letter/shape tracing). Counting and shape names are expressed as plain
  // text/emoji prompts rather than image options, sidestepping the
  // image-option question the K-6 plan flagged as unresolved.
  console.log('🌱 Seeding Pre-K/K Math course...');

  const preKMathCourse = await prisma.course.upsert({
    where: { slug: 'counting-and-shapes' },
    update: { gradeBand: 'PRE_K_K', sortOrder: -1 },
    create: {
      learningSubjectId: mathLearningSubject.id,
      title: 'Counting & Shapes',
      slug: 'counting-and-shapes',
      description: 'Learn to count, compare amounts, and name basic shapes.',
      estimatedHours: 2,
      status: 'PUBLISHED',
      sortOrder: -1,
      gradeBand: 'PRE_K_K',
    },
  });

  const countingChapter = await prisma.concept.upsert({
    where: { name: 'Counting' },
    update: { courseId: preKMathCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Counting', description: 'Counting small groups of objects.', courseId: preKMathCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let countingLesson = await prisma.lesson.findFirst({ where: { title: 'Counting to 10', conceptId: countingChapter.id } });
  if (!countingLesson) {
    countingLesson = await prisma.lesson.create({ data: { conceptId: countingChapter.id, title: 'Counting to 10', description: "Let's count things together!", sortOrder: 1, xpReward: 20 } });
    await prisma.card.create({ data: { lessonId: countingLesson.id, title: 'Counting Things', sortOrder: 1, cardType: 'CONCEPTUAL', content: "Let's count things together! Count each one out loud." } });
    const countQ1 = await makeQ(mathSubject.id, kLevel.id, 'How many apples? 🍎🍎🍎', [{ label: 'A', text: '3', correct: true }, { label: 'B', text: '2', correct: false }, { label: 'C', text: '4', correct: false }, { label: 'D', text: '5', correct: false }], 'Count each apple one at a time: 1, 2, 3.');
    await prisma.card.create({ data: { lessonId: countingLesson.id, title: 'Count Them Up', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Count carefully, then tap the right number.', questionId: countQ1.id } });
    const countQ2 = await makeQ(mathSubject.id, kLevel.id, 'How many stars? ⭐⭐⭐⭐⭐⭐', [{ label: 'A', text: '6', correct: true }, { label: 'B', text: '5', correct: false }, { label: 'C', text: '7', correct: false }, { label: 'D', text: '8', correct: false }], 'Count each star one at a time: 1, 2, 3, 4, 5, 6.');
    await prisma.card.create({ data: { lessonId: countingLesson.id, title: 'Count Them Up', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Count carefully, then tap the right number.', questionId: countQ2.id } });
  }

  let moreOrFewerLesson = await prisma.lesson.findFirst({ where: { title: 'More or Fewer', conceptId: countingChapter.id } });
  if (!moreOrFewerLesson) {
    moreOrFewerLesson = await prisma.lesson.create({ data: { conceptId: countingChapter.id, title: 'More or Fewer', description: 'Compare two groups of objects.', sortOrder: 2, xpReward: 20 } });
    await prisma.card.create({ data: { lessonId: moreOrFewerLesson.id, title: 'Comparing Amounts', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Which group has more? Count both and compare.' } });
    const compareQ1 = await makeQ(mathSubject.id, kLevel.id, 'Group A: 🐱🐱🐱🐱  Group B: 🐱🐱. Which group has more?', [{ label: 'A', text: 'Group A', correct: true }, { label: 'B', text: 'Group B', correct: false }, { label: 'C', text: 'They are the same', correct: false }], 'Group A has 4 cats, Group B has 2 cats — 4 is more than 2.');
    await prisma.card.create({ data: { lessonId: moreOrFewerLesson.id, title: 'Which Has More?', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Count each group, then tap your answer.', questionId: compareQ1.id } });
    const compareQ2 = await makeQ(mathSubject.id, kLevel.id, 'Group A: 🐟  Group B: 🐟🐟🐟. Which group has fewer?', [{ label: 'A', text: 'Group A', correct: true }, { label: 'B', text: 'Group B', correct: false }, { label: 'C', text: 'They are the same', correct: false }], 'Group A has 1 fish, Group B has 3 fish — 1 is fewer than 3.');
    await prisma.card.create({ data: { lessonId: moreOrFewerLesson.id, title: 'Which Has Fewer?', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Count each group, then tap your answer.', questionId: compareQ2.id } });
  }

  const shapesChapter = await prisma.concept.upsert({
    where: { name: 'Shapes' },
    update: { courseId: preKMathCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Shapes', description: 'Naming basic shapes.', courseId: preKMathCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let basicShapesLesson = await prisma.lesson.findFirst({ where: { title: 'Basic Shapes', conceptId: shapesChapter.id } });
  if (!basicShapesLesson) {
    basicShapesLesson = await prisma.lesson.create({ data: { conceptId: shapesChapter.id, title: 'Basic Shapes', description: 'Circles, squares, and triangles.', sortOrder: 1, xpReward: 20 } });
    await prisma.card.create({ data: { lessonId: basicShapesLesson.id, title: 'Shapes All Around', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Shapes are everywhere! Let\'s learn their names.' } });
    const shapeQ1 = await makeQ(mathSubject.id, kLevel.id, 'Which shape is round, with no corners? 🔵', [{ label: 'A', text: 'Circle', correct: true }, { label: 'B', text: 'Square', correct: false }, { label: 'C', text: 'Triangle', correct: false }], 'A circle is perfectly round and has no corners.');
    await prisma.card.create({ data: { lessonId: basicShapesLesson.id, title: 'Name the Shape', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Look carefully, then tap the shape\'s name.', questionId: shapeQ1.id } });
    const shapeQ2 = await makeQ(mathSubject.id, kLevel.id, 'Which shape has 3 sides and 3 corners? 🔺', [{ label: 'A', text: 'Triangle', correct: true }, { label: 'B', text: 'Square', correct: false }, { label: 'C', text: 'Circle', correct: false }], 'A triangle always has exactly 3 sides and 3 corners.');
    await prisma.card.create({ data: { lessonId: basicShapesLesson.id, title: 'Name the Shape', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Look carefully, then tap the shape\'s name.', questionId: shapeQ2.id } });
  }

  let matchShapesLesson = await prisma.lesson.findFirst({ where: { title: 'Match Shapes to Names', conceptId: shapesChapter.id } });
  if (!matchShapesLesson) {
    matchShapesLesson = await prisma.lesson.create({ data: { conceptId: shapesChapter.id, title: 'Match Shapes to Names', description: 'Match each shape to its name.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: matchShapesLesson.id, title: 'Match Them Up', sortOrder: 1, cardType: 'CONCEPTUAL', content: "Let's match shapes to their names." } });
    const matchShapesQ = await prisma.question.create({
      data: {
        subjectId: mathSubject.id,
        classId: kLevel.id,
        questionType: 'interactive',
        prompt: 'Match each shape to its name.',
        correctAnswer: null,
        widgetType: 'GRID_MATCHING',
        isGraded: true,
        explanation: 'A circle is round, a square has 4 equal sides, a triangle has 3 sides, and a rectangle has 4 sides with two pairs equal.',
        hints: ['Count the sides and corners of each shape.'],
        widgetConfig: {
          left: [
            { id: 'circle-shape', text: '🔵' },
            { id: 'square-shape', text: '🟧' },
            { id: 'triangle-shape', text: '🔺' },
            { id: 'rectangle-shape', text: '▬' },
          ],
          right: [
            { id: 'circle-name', text: 'Circle' },
            { id: 'square-name', text: 'Square' },
            { id: 'triangle-name', text: 'Triangle' },
            { id: 'rectangle-name', text: 'Rectangle' },
          ],
          correctPairs: [
            ['circle-shape', 'circle-name'],
            ['square-shape', 'square-name'],
            ['triangle-shape', 'triangle-name'],
            ['rectangle-shape', 'rectangle-name'],
          ],
        },
      },
    });
    await prisma.card.create({ data: { lessonId: matchShapesLesson.id, title: 'Match Them Up', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap a shape, then tap its matching name.', questionId: matchShapesQ.id } });
  }

  const preKMathCheckpoint = await prisma.concept.upsert({
    where: { name: 'Counting & Shapes Checkpoint' },
    update: { courseId: preKMathCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: { name: 'Counting & Shapes Checkpoint', description: 'A short checkpoint on counting and shapes — pass at 70% or better on the first try.', courseId: preKMathCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
  });
  let preKMathCheckpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Counting & Shapes', conceptId: preKMathCheckpoint.id } });
  if (!preKMathCheckpointLesson) {
    preKMathCheckpointLesson = await prisma.lesson.create({ data: { conceptId: preKMathCheckpoint.id, title: 'Checkpoint: Counting & Shapes', description: "Let's see what you've learned!", sortOrder: 1, xpReward: 50 } });
    await prisma.card.create({ data: { lessonId: preKMathCheckpointLesson.id, title: 'Before You Start', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Do your best! Count carefully and look closely at each shape.' } });
    const preKCheckpointQ1 = await makeQ(mathSubject.id, kLevel.id, 'How many balloons? 🎈🎈🎈🎈', [{ label: 'A', text: '4', correct: true }, { label: 'B', text: '3', correct: false }, { label: 'C', text: '5', correct: false }, { label: 'D', text: '6', correct: false }], 'Count each balloon one at a time: 1, 2, 3, 4.');
    await prisma.card.create({ data: { lessonId: preKMathCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 2, cardType: 'CHECKPOINT', content: 'Count carefully, then tap the right number.', questionId: preKCheckpointQ1.id } });
    const preKCheckpointQ2 = await makeQ(mathSubject.id, kLevel.id, 'Which shape has 4 equal sides? 🟧', [{ label: 'A', text: 'Square', correct: true }, { label: 'B', text: 'Triangle', correct: false }, { label: 'C', text: 'Circle', correct: false }], 'A square has 4 sides that are all the same length.');
    await prisma.card.create({ data: { lessonId: preKMathCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 3, cardType: 'CHECKPOINT', content: 'Look carefully, then tap your answer.', questionId: preKCheckpointQ2.id } });
  }

  console.log('✅ Seeded Pre-K/K Math course');

  // ─── K-6 expansion: Grades 1-2 Math ───────────────────────────────────────
  console.log('🌱 Seeding Grades 1-2 Math course...');

  const g12MathCourse = await prisma.course.upsert({
    where: { slug: 'adding-and-subtracting' },
    update: { gradeBand: 'G1_2', sortOrder: 0 },
    create: {
      learningSubjectId: mathLearningSubject.id,
      title: 'Adding & Subtracting',
      slug: 'adding-and-subtracting',
      description: 'Add and subtract numbers within 20, and solve simple word problems.',
      estimatedHours: 3,
      status: 'PUBLISHED',
      sortOrder: 0,
      gradeBand: 'G1_2',
    },
  });

  const additionChapter = await prisma.concept.upsert({
    where: { name: 'Addition within 20' },
    update: { courseId: g12MathCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Addition within 20', description: 'Adding numbers up to 20.', courseId: g12MathCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let addingLesson = await prisma.lesson.findFirst({ where: { title: 'Adding Small Numbers', conceptId: additionChapter.id } });
  if (!addingLesson) {
    addingLesson = await prisma.lesson.create({ data: { conceptId: additionChapter.id, title: 'Adding Small Numbers', description: "Let's practice addition!", sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: addingLesson.id, title: 'Putting Numbers Together', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Addition means putting groups of things together to find the total.' } });
    const addQ1 = await makeQ(mathSubject.id, g1Level.id, 'What is 4 + 3?', [{ label: 'A', text: '7', correct: true }, { label: 'B', text: '6', correct: false }, { label: 'C', text: '8', correct: false }, { label: 'D', text: '5', correct: false }], 'Start at 4 and count up 3 more: 5, 6, 7.');
    await prisma.card.create({ data: { lessonId: addingLesson.id, title: 'Add It Up', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Work it out, then tap the answer.', questionId: addQ1.id } });
    const addQ2 = await makeQ(mathSubject.id, g1Level.id, 'What is 9 + 6?', [{ label: 'A', text: '15', correct: true }, { label: 'B', text: '14', correct: false }, { label: 'C', text: '16', correct: false }, { label: 'D', text: '13', correct: false }], 'Start at 9 and count up 6 more: 10, 11, 12, 13, 14, 15.');
    await prisma.card.create({ data: { lessonId: addingLesson.id, title: 'Add It Up', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Work it out, then tap the answer.', questionId: addQ2.id } });
  }

  let addWordProblemsLesson = await prisma.lesson.findFirst({ where: { title: 'Addition Word Problems', conceptId: additionChapter.id } });
  if (!addWordProblemsLesson) {
    addWordProblemsLesson = await prisma.lesson.create({ data: { conceptId: additionChapter.id, title: 'Addition Word Problems', description: 'Use addition to solve real problems.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: addWordProblemsLesson.id, title: 'Story Problems', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Read carefully, then decide what to add.' } });
    const addWordQ1 = await makeQ(mathSubject.id, g1Level.id, 'Maya has 5 stickers. She gets 8 more. How many stickers does she have now?', [{ label: 'A', text: '13', correct: true }, { label: 'B', text: '12', correct: false }, { label: 'C', text: '14', correct: false }, { label: 'D', text: '3', correct: false }], '5 + 8 = 13. Maya started with 5 and got 8 more.');
    await prisma.card.create({ data: { lessonId: addWordProblemsLesson.id, title: 'Solve the Problem', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read the problem, then tap the answer.', questionId: addWordQ1.id } });
    const addWordQ2 = await makeQ(mathSubject.id, g1Level.id, 'There are 7 red balloons and 7 blue balloons. How many balloons in all?', [{ label: 'A', text: '14', correct: true }, { label: 'B', text: '13', correct: false }, { label: 'C', text: '15', correct: false }, { label: 'D', text: '0', correct: false }], '7 + 7 = 14.');
    await prisma.card.create({ data: { lessonId: addWordProblemsLesson.id, title: 'Solve the Problem', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read the problem, then tap the answer.', questionId: addWordQ2.id } });
  }

  const subtractionChapter = await prisma.concept.upsert({
    where: { name: 'Subtraction within 20' },
    update: { courseId: g12MathCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Subtraction within 20', description: 'Subtracting numbers up to 20.', courseId: g12MathCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let subtractingLesson = await prisma.lesson.findFirst({ where: { title: 'Subtracting Small Numbers', conceptId: subtractionChapter.id } });
  if (!subtractingLesson) {
    subtractingLesson = await prisma.lesson.create({ data: { conceptId: subtractionChapter.id, title: 'Subtracting Small Numbers', description: "Let's practice subtraction!", sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: subtractingLesson.id, title: 'Taking Away', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Subtraction means taking some away from a group to find what is left.' } });
    const subQ1 = await makeQ(mathSubject.id, g1Level.id, 'What is 9 - 4?', [{ label: 'A', text: '5', correct: true }, { label: 'B', text: '4', correct: false }, { label: 'C', text: '6', correct: false }, { label: 'D', text: '13', correct: false }], 'Start at 9 and count back 4: 8, 7, 6, 5.');
    await prisma.card.create({ data: { lessonId: subtractingLesson.id, title: 'Take It Away', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Work it out, then tap the answer.', questionId: subQ1.id } });
    const subQ2 = await makeQ(mathSubject.id, g1Level.id, 'What is 15 - 7?', [{ label: 'A', text: '8', correct: true }, { label: 'B', text: '7', correct: false }, { label: 'C', text: '9', correct: false }, { label: 'D', text: '22', correct: false }], 'Start at 15 and count back 7: 14, 13, 12, 11, 10, 9, 8.');
    await prisma.card.create({ data: { lessonId: subtractingLesson.id, title: 'Take It Away', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Work it out, then tap the answer.', questionId: subQ2.id } });
  }

  let subWordProblemsLesson = await prisma.lesson.findFirst({ where: { title: 'Subtraction Word Problems', conceptId: subtractionChapter.id } });
  if (!subWordProblemsLesson) {
    subWordProblemsLesson = await prisma.lesson.create({ data: { conceptId: subtractionChapter.id, title: 'Subtraction Word Problems', description: 'Use subtraction to solve real problems.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: subWordProblemsLesson.id, title: 'Story Problems', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Read carefully, then decide what to subtract.' } });
    const subWordQ1 = await makeQ(mathSubject.id, g1Level.id, 'Jake had 12 crayons. He gave 5 away. How many does he have left?', [{ label: 'A', text: '7', correct: true }, { label: 'B', text: '6', correct: false }, { label: 'C', text: '8', correct: false }, { label: 'D', text: '17', correct: false }], '12 - 5 = 7.');
    await prisma.card.create({ data: { lessonId: subWordProblemsLesson.id, title: 'Solve the Problem', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read the problem, then tap the answer.', questionId: subWordQ1.id } });
    const subWordQ2 = await makeQ(mathSubject.id, g1Level.id, 'There were 18 birds on a wire. 9 flew away. How many are left?', [{ label: 'A', text: '9', correct: true }, { label: 'B', text: '10', correct: false }, { label: 'C', text: '8', correct: false }, { label: 'D', text: '27', correct: false }], '18 - 9 = 9.');
    await prisma.card.create({ data: { lessonId: subWordProblemsLesson.id, title: 'Solve the Problem', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read the problem, then tap the answer.', questionId: subWordQ2.id } });
  }

  const g12MathCheckpoint = await prisma.concept.upsert({
    where: { name: 'Adding & Subtracting Checkpoint' },
    update: { courseId: g12MathCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: { name: 'Adding & Subtracting Checkpoint', description: 'A short checkpoint on addition and subtraction — pass at 70% or better on the first try.', courseId: g12MathCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
  });
  let g12MathCheckpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Adding & Subtracting', conceptId: g12MathCheckpoint.id } });
  if (!g12MathCheckpointLesson) {
    g12MathCheckpointLesson = await prisma.lesson.create({ data: { conceptId: g12MathCheckpoint.id, title: 'Checkpoint: Adding & Subtracting', description: "Let's see what you've learned!", sortOrder: 1, xpReward: 55 } });
    await prisma.card.create({ data: { lessonId: g12MathCheckpointLesson.id, title: 'Before You Start', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Do your best! Take your time with each problem.' } });
    const g12CheckpointQ1 = await makeQ(mathSubject.id, g1Level.id, 'What is 6 + 9?', [{ label: 'A', text: '15', correct: true }, { label: 'B', text: '14', correct: false }, { label: 'C', text: '16', correct: false }, { label: 'D', text: '13', correct: false }], '6 + 9 = 15.');
    await prisma.card.create({ data: { lessonId: g12MathCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 2, cardType: 'CHECKPOINT', content: 'Work it out, then tap the answer.', questionId: g12CheckpointQ1.id } });
    const g12CheckpointQ2 = await makeQ(mathSubject.id, g1Level.id, 'What is 16 - 8?', [{ label: 'A', text: '8', correct: true }, { label: 'B', text: '9', correct: false }, { label: 'C', text: '7', correct: false }, { label: 'D', text: '24', correct: false }], '16 - 8 = 8.');
    await prisma.card.create({ data: { lessonId: g12MathCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 3, cardType: 'CHECKPOINT', content: 'Work it out, then tap the answer.', questionId: g12CheckpointQ2.id } });
  }

  console.log('✅ Seeded Grades 1-2 Math course');

  // ─── K-6 expansion: Grades 1-2 Language Arts ──────────────────────────────
  console.log('🌱 Seeding Grades 1-2 Language Arts course...');

  const g12LaCourse = await prisma.course.upsert({
    where: { slug: 'reading-and-sentences' },
    update: { gradeBand: 'G1_2', sortOrder: 1 },
    create: {
      learningSubjectId: laLearningSubject.id,
      title: 'Reading & Sentences',
      slug: 'reading-and-sentences',
      description: 'Build sight-word vocabulary and learn to read and punctuate simple sentences.',
      estimatedHours: 3,
      status: 'PUBLISHED',
      sortOrder: 1,
      gradeBand: 'G1_2',
    },
  });

  const sightWordsChapter = await prisma.concept.upsert({
    where: { name: 'Sight Words' },
    update: { courseId: g12LaCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Sight Words', description: 'Common words to recognize instantly.', courseId: g12LaCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let sightWordsLesson = await prisma.lesson.findFirst({ where: { title: 'Common Sight Words', conceptId: sightWordsChapter.id } });
  if (!sightWordsLesson) {
    sightWordsLesson = await prisma.lesson.create({ data: { conceptId: sightWordsChapter.id, title: 'Common Sight Words', description: 'Words you should know by sight.', sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: sightWordsLesson.id, title: 'Words to Know', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Some words show up so often that you should recognize them right away.' } });
    const sightQ1 = await makeQ(engSubject.id, g1Level.id, "Which word means the opposite of 'stop'?", [{ label: 'A', text: 'go', correct: true }, { label: 'B', text: 'sit', correct: false }, { label: 'C', text: 'red', correct: false }, { label: 'D', text: 'walk', correct: false }], "'Go' is the opposite of 'stop'.");
    await prisma.card.create({ data: { lessonId: sightWordsLesson.id, title: 'Pick the Word', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read carefully, then tap your answer.', questionId: sightQ1.id } });
    const sightQ2 = await makeQ(engSubject.id, g1Level.id, "Which word fits: 'I ___ to the park.'", [{ label: 'A', text: 'went', correct: true }, { label: 'B', text: 'jump', correct: false }, { label: 'C', text: 'blue', correct: false }, { label: 'D', text: 'happy', correct: false }], "'Went' fits because it tells what already happened.");
    await prisma.card.create({ data: { lessonId: sightWordsLesson.id, title: 'Pick the Word', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read carefully, then tap your answer.', questionId: sightQ2.id } });
  }

  let readSentencesLesson = await prisma.lesson.findFirst({ where: { title: 'Reading Simple Sentences', conceptId: sightWordsChapter.id } });
  if (!readSentencesLesson) {
    readSentencesLesson = await prisma.lesson.create({ data: { conceptId: sightWordsChapter.id, title: 'Reading Simple Sentences', description: 'Practice reading short sentences.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: readSentencesLesson.id, title: 'Reading Together', sortOrder: 1, cardType: 'CONCEPTUAL', content: "Let's read a sentence and answer a question about it." } });
    const readQ1 = await makeQ(engSubject.id, g1Level.id, "'The dog ran fast.' What did the dog do?", [{ label: 'A', text: 'ran', correct: true }, { label: 'B', text: 'slept', correct: false }, { label: 'C', text: 'ate', correct: false }, { label: 'D', text: 'jumped', correct: false }], "The sentence says the dog ran fast.");
    await prisma.card.create({ data: { lessonId: readSentencesLesson.id, title: 'Read and Answer', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read the sentence, then tap your answer.', questionId: readQ1.id } });
    const readQ2 = await makeQ(engSubject.id, g1Level.id, "'The sun is hot.' What is hot?", [{ label: 'A', text: 'the sun', correct: true }, { label: 'B', text: 'the dog', correct: false }, { label: 'C', text: 'the park', correct: false }, { label: 'D', text: 'the book', correct: false }], "The sentence says the sun is hot.");
    await prisma.card.create({ data: { lessonId: readSentencesLesson.id, title: 'Read and Answer', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read the sentence, then tap your answer.', questionId: readQ2.id } });
  }

  const punctuationChapter = await prisma.concept.upsert({
    where: { name: 'Punctuation Basics' },
    update: { courseId: g12LaCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Punctuation Basics', description: 'Ending a sentence the right way.', courseId: g12LaCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let endingPunctuationLesson = await prisma.lesson.findFirst({ where: { title: 'Ending Punctuation', conceptId: punctuationChapter.id } });
  if (!endingPunctuationLesson) {
    endingPunctuationLesson = await prisma.lesson.create({ data: { conceptId: punctuationChapter.id, title: 'Ending Punctuation', description: 'Periods, question marks, and exclamation points.', sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: endingPunctuationLesson.id, title: 'How Sentences End', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A period ends a statement, a question mark ends a question, and an exclamation point shows excitement.' } });
    const punctQ1 = await makeQ(engSubject.id, g1Level.id, "Which mark ends this sentence? 'What is your name___'", [{ label: 'A', text: '?', correct: true }, { label: 'B', text: '.', correct: false }, { label: 'C', text: '!', correct: false }], "It's a question, so it ends with a question mark.");
    await prisma.card.create({ data: { lessonId: endingPunctuationLesson.id, title: 'Pick the Mark', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read the sentence, then tap the right mark.', questionId: punctQ1.id } });
    const punctQ2 = await makeQ(engSubject.id, g1Level.id, "Which mark ends this sentence? 'We won the game___'", [{ label: 'A', text: '!', correct: true }, { label: 'B', text: '.', correct: false }, { label: 'C', text: '?', correct: false }], "It shows excitement, so it ends with an exclamation point.");
    await prisma.card.create({ data: { lessonId: endingPunctuationLesson.id, title: 'Pick the Mark', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read the sentence, then tap the right mark.', questionId: punctQ2.id } });
  }

  let matchPunctuationLesson = await prisma.lesson.findFirst({ where: { title: 'Match Punctuation to Sentences', conceptId: punctuationChapter.id } });
  if (!matchPunctuationLesson) {
    matchPunctuationLesson = await prisma.lesson.create({ data: { conceptId: punctuationChapter.id, title: 'Match Punctuation to Sentences', description: 'Match each sentence to the mark it needs.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: matchPunctuationLesson.id, title: 'Match Them Up', sortOrder: 1, cardType: 'CONCEPTUAL', content: "Let's match sentences to their ending marks." } });
    const matchPunctQ = await prisma.question.create({
      data: {
        subjectId: engSubject.id,
        classId: g1Level.id,
        questionType: 'interactive',
        prompt: 'Match each sentence to the punctuation mark it needs.',
        correctAnswer: null,
        widgetType: 'GRID_MATCHING',
        isGraded: true,
        explanation: 'Statements end with a period, questions end with a question mark, and exciting sentences end with an exclamation point.',
        hints: ['Ask yourself: is this a statement, a question, or something exciting?'],
        widgetConfig: {
          left: [
            { id: 'statement', text: 'I like pizza' },
            { id: 'question', text: 'Where is my hat' },
            { id: 'excitement', text: 'Watch out' },
          ],
          right: [
            { id: 'period', text: '.' },
            { id: 'question-mark', text: '?' },
            { id: 'exclamation', text: '!' },
          ],
          correctPairs: [
            ['statement', 'period'],
            ['question', 'question-mark'],
            ['excitement', 'exclamation'],
          ],
        },
      },
    });
    await prisma.card.create({ data: { lessonId: matchPunctuationLesson.id, title: 'Match Them Up', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap a sentence, then tap its matching mark.', questionId: matchPunctQ.id } });
  }

  const g12LaCheckpoint = await prisma.concept.upsert({
    where: { name: 'Reading & Sentences Checkpoint' },
    update: { courseId: g12LaCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: { name: 'Reading & Sentences Checkpoint', description: 'A short checkpoint on sight words and punctuation — pass at 70% or better on the first try.', courseId: g12LaCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
  });
  let g12LaCheckpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Reading & Sentences', conceptId: g12LaCheckpoint.id } });
  if (!g12LaCheckpointLesson) {
    g12LaCheckpointLesson = await prisma.lesson.create({ data: { conceptId: g12LaCheckpoint.id, title: 'Checkpoint: Reading & Sentences', description: "Let's see what you've learned!", sortOrder: 1, xpReward: 55 } });
    await prisma.card.create({ data: { lessonId: g12LaCheckpointLesson.id, title: 'Before You Start', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Do your best! Read each sentence carefully.' } });
    const g12LaCheckpointQ1 = await makeQ(engSubject.id, g1Level.id, "'The cat is sleeping.' What is the cat doing?", [{ label: 'A', text: 'sleeping', correct: true }, { label: 'B', text: 'running', correct: false }, { label: 'C', text: 'eating', correct: false }, { label: 'D', text: 'playing', correct: false }], "The sentence says the cat is sleeping.");
    await prisma.card.create({ data: { lessonId: g12LaCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 2, cardType: 'CHECKPOINT', content: 'Read the sentence, then tap your answer.', questionId: g12LaCheckpointQ1.id } });
    const g12LaCheckpointQ2 = await makeQ(engSubject.id, g1Level.id, "Which mark ends this sentence? 'Is it raining outside___'", [{ label: 'A', text: '?', correct: true }, { label: 'B', text: '.', correct: false }, { label: 'C', text: '!', correct: false }], "It's a question, so it ends with a question mark.");
    await prisma.card.create({ data: { lessonId: g12LaCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 3, cardType: 'CHECKPOINT', content: 'Read the sentence, then tap the right mark.', questionId: g12LaCheckpointQ2.id } });
  }

  console.log('✅ Seeded Grades 1-2 Language Arts course');

  // ─── K-6 expansion: Grades 3-4 Math ───────────────────────────────────────
  console.log('🌱 Seeding Grades 3-4 Math course...');

  const g34MathCourse = await prisma.course.upsert({
    where: { slug: 'multiplication-division-and-fractions' },
    update: { gradeBand: 'G3_4', sortOrder: 2 },
    create: {
      learningSubjectId: mathLearningSubject.id,
      title: 'Multiplication, Division & Fractions',
      slug: 'multiplication-division-and-fractions',
      description: 'Multiply and divide whole numbers, and get started with fractions.',
      estimatedHours: 4,
      status: 'PUBLISHED',
      sortOrder: 2,
      gradeBand: 'G3_4',
    },
  });

  const multiplicationChapter = await prisma.concept.upsert({
    where: { name: 'Multiplication Basics' },
    update: { courseId: g34MathCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Multiplication Basics', description: 'Multiplying single-digit numbers.', courseId: g34MathCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let multiplyingLesson = await prisma.lesson.findFirst({ where: { title: 'Multiplying by Single Digits', conceptId: multiplicationChapter.id } });
  if (!multiplyingLesson) {
    multiplyingLesson = await prisma.lesson.create({ data: { conceptId: multiplicationChapter.id, title: 'Multiplying by Single Digits', description: "Let's practice multiplication!", sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: multiplyingLesson.id, title: 'Groups of Things', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Multiplication is adding equal groups together, over and over.' } });
    const mulQ1 = await makeQ(mathSubject.id, g3Level.id, 'What is 6 × 7?', [{ label: 'A', text: '42', correct: true }, { label: 'B', text: '36', correct: false }, { label: 'C', text: '48', correct: false }, { label: 'D', text: '49', correct: false }], '6 groups of 7 is 42.');
    await prisma.card.create({ data: { lessonId: multiplyingLesson.id, title: 'Multiply It', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Work it out, then tap the answer.', questionId: mulQ1.id } });
    const mulQ2 = await makeQ(mathSubject.id, g3Level.id, 'What is 8 × 9?', [{ label: 'A', text: '72', correct: true }, { label: 'B', text: '64', correct: false }, { label: 'C', text: '81', correct: false }, { label: 'D', text: '63', correct: false }], '8 groups of 9 is 72.');
    await prisma.card.create({ data: { lessonId: multiplyingLesson.id, title: 'Multiply It', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Work it out, then tap the answer.', questionId: mulQ2.id } });
  }

  let mulWordProblemsLesson = await prisma.lesson.findFirst({ where: { title: 'Multiplication Word Problems', conceptId: multiplicationChapter.id } });
  if (!mulWordProblemsLesson) {
    mulWordProblemsLesson = await prisma.lesson.create({ data: { conceptId: multiplicationChapter.id, title: 'Multiplication Word Problems', description: 'Use multiplication to solve real problems.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: mulWordProblemsLesson.id, title: 'Story Problems', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Look for equal groups — that means multiply.' } });
    const mulWordQ1 = await makeQ(mathSubject.id, g3Level.id, 'There are 5 boxes with 6 apples in each box. How many apples in all?', [{ label: 'A', text: '30', correct: true }, { label: 'B', text: '25', correct: false }, { label: 'C', text: '11', correct: false }, { label: 'D', text: '36', correct: false }], '5 boxes × 6 apples = 30 apples.');
    await prisma.card.create({ data: { lessonId: mulWordProblemsLesson.id, title: 'Solve the Problem', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read the problem, then tap the answer.', questionId: mulWordQ1.id } });
    const mulWordQ2 = await makeQ(mathSubject.id, g3Level.id, 'A van has 4 rows of seats with 3 seats in each row. How many seats total?', [{ label: 'A', text: '12', correct: true }, { label: 'B', text: '7', correct: false }, { label: 'C', text: '9', correct: false }, { label: 'D', text: '16', correct: false }], '4 rows × 3 seats = 12 seats.');
    await prisma.card.create({ data: { lessonId: mulWordProblemsLesson.id, title: 'Solve the Problem', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read the problem, then tap the answer.', questionId: mulWordQ2.id } });
  }

  const divisionChapter = await prisma.concept.upsert({
    where: { name: 'Division Basics' },
    update: { courseId: g34MathCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Division Basics', description: 'Dividing whole numbers evenly.', courseId: g34MathCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let dividingLesson = await prisma.lesson.findFirst({ where: { title: 'Dividing Evenly', conceptId: divisionChapter.id } });
  if (!dividingLesson) {
    dividingLesson = await prisma.lesson.create({ data: { conceptId: divisionChapter.id, title: 'Dividing Evenly', description: "Let's practice division!", sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: dividingLesson.id, title: 'Sharing Equally', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Division means splitting a group into equal smaller groups.' } });
    const divQ1 = await makeQ(mathSubject.id, g3Level.id, 'What is 36 ÷ 6?', [{ label: 'A', text: '6', correct: true }, { label: 'B', text: '5', correct: false }, { label: 'C', text: '7', correct: false }, { label: 'D', text: '8', correct: false }], '36 split into 6 equal groups gives 6 in each group.');
    await prisma.card.create({ data: { lessonId: dividingLesson.id, title: 'Divide It', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Work it out, then tap the answer.', questionId: divQ1.id } });
    const divQ2 = await makeQ(mathSubject.id, g3Level.id, 'What is 63 ÷ 9?', [{ label: 'A', text: '7', correct: true }, { label: 'B', text: '8', correct: false }, { label: 'C', text: '6', correct: false }, { label: 'D', text: '9', correct: false }], '63 split into 9 equal groups gives 7 in each group.');
    await prisma.card.create({ data: { lessonId: dividingLesson.id, title: 'Divide It', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Work it out, then tap the answer.', questionId: divQ2.id } });
  }

  let divWordProblemsLesson = await prisma.lesson.findFirst({ where: { title: 'Division Word Problems', conceptId: divisionChapter.id } });
  if (!divWordProblemsLesson) {
    divWordProblemsLesson = await prisma.lesson.create({ data: { conceptId: divisionChapter.id, title: 'Division Word Problems', description: 'Use division to solve real problems.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: divWordProblemsLesson.id, title: 'Story Problems', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Look for equal sharing — that means divide.' } });
    const divWordQ1 = await makeQ(mathSubject.id, g3Level.id, '24 cookies are shared equally among 4 friends. How many cookies does each friend get?', [{ label: 'A', text: '6', correct: true }, { label: 'B', text: '5', correct: false }, { label: 'C', text: '8', correct: false }, { label: 'D', text: '20', correct: false }], '24 ÷ 4 = 6 cookies each.');
    await prisma.card.create({ data: { lessonId: divWordProblemsLesson.id, title: 'Solve the Problem', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read the problem, then tap the answer.', questionId: divWordQ1.id } });
    const divWordQ2 = await makeQ(mathSubject.id, g3Level.id, '45 students are split evenly into 5 teams. How many students per team?', [{ label: 'A', text: '9', correct: true }, { label: 'B', text: '8', correct: false }, { label: 'C', text: '10', correct: false }, { label: 'D', text: '40', correct: false }], '45 ÷ 5 = 9 students per team.');
    await prisma.card.create({ data: { lessonId: divWordProblemsLesson.id, title: 'Solve the Problem', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read the problem, then tap the answer.', questionId: divWordQ2.id } });
  }

  const fractionsIntroChapter = await prisma.concept.upsert({
    where: { name: 'Fractions Intro' },
    update: { courseId: g34MathCourse.id, sortOrder: 3, kind: 'CHAPTER' },
    create: { name: 'Fractions Intro', description: 'Naming and comparing simple fractions.', courseId: g34MathCourse.id, sortOrder: 3, kind: 'CHAPTER' },
  });

  let namingFractionsLesson = await prisma.lesson.findFirst({ where: { title: 'Naming Fractions', conceptId: fractionsIntroChapter.id } });
  if (!namingFractionsLesson) {
    namingFractionsLesson = await prisma.lesson.create({ data: { conceptId: fractionsIntroChapter.id, title: 'Naming Fractions', description: 'A fraction names part of a whole.', sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: namingFractionsLesson.id, title: 'Parts of a Whole', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A fraction tells you how many equal parts you have out of the total parts.' } });
    const fracQ1 = await makeQ(mathSubject.id, g3Level.id, 'A pizza is cut into 4 equal slices. You eat 1 slice. What fraction did you eat?', [{ label: 'A', text: '1/4', correct: true }, { label: 'B', text: '1/3', correct: false }, { label: 'C', text: '4/1', correct: false }, { label: 'D', text: '1/2', correct: false }], 'You ate 1 out of 4 equal slices, so 1/4.');
    await prisma.card.create({ data: { lessonId: namingFractionsLesson.id, title: 'Name the Fraction', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read carefully, then tap the fraction.', questionId: fracQ1.id } });
    const fracQ2 = await makeQ(mathSubject.id, g3Level.id, 'A chocolate bar has 8 equal pieces. You eat 3 pieces. What fraction did you eat?', [{ label: 'A', text: '3/8', correct: true }, { label: 'B', text: '3/5', correct: false }, { label: 'C', text: '8/3', correct: false }, { label: 'D', text: '5/8', correct: false }], 'You ate 3 out of 8 equal pieces, so 3/8.');
    await prisma.card.create({ data: { lessonId: namingFractionsLesson.id, title: 'Name the Fraction', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read carefully, then tap the fraction.', questionId: fracQ2.id } });
  }

  let comparingFractionsLesson = await prisma.lesson.findFirst({ where: { title: 'Comparing Fractions', conceptId: fractionsIntroChapter.id } });
  if (!comparingFractionsLesson) {
    comparingFractionsLesson = await prisma.lesson.create({ data: { conceptId: fractionsIntroChapter.id, title: 'Comparing Fractions', description: 'Which fraction is bigger?', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: comparingFractionsLesson.id, title: 'Bigger or Smaller', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'When the whole is split into fewer parts, each part is bigger.' } });
    const compFracQ1 = await makeQ(mathSubject.id, g3Level.id, 'Which is bigger: 1/2 or 1/4?', [{ label: 'A', text: '1/2', correct: true }, { label: 'B', text: '1/4', correct: false }, { label: 'C', text: 'They are equal', correct: false }], 'Splitting into 2 parts makes bigger pieces than splitting into 4 parts, so 1/2 is bigger.');
    await prisma.card.create({ data: { lessonId: comparingFractionsLesson.id, title: 'Compare Them', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Think about the size of each piece, then tap your answer.', questionId: compFracQ1.id } });
    const compFracQ2 = await makeQ(mathSubject.id, g3Level.id, 'Which is smaller: 1/3 or 1/8?', [{ label: 'A', text: '1/8', correct: true }, { label: 'B', text: '1/3', correct: false }, { label: 'C', text: 'They are equal', correct: false }], 'Splitting into 8 parts makes smaller pieces than splitting into 3 parts, so 1/8 is smaller.');
    await prisma.card.create({ data: { lessonId: comparingFractionsLesson.id, title: 'Compare Them', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Think about the size of each piece, then tap your answer.', questionId: compFracQ2.id } });
  }

  const g34MathCheckpoint = await prisma.concept.upsert({
    where: { name: 'Multiplication, Division & Fractions Checkpoint' },
    update: { courseId: g34MathCourse.id, sortOrder: 4, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: { name: 'Multiplication, Division & Fractions Checkpoint', description: 'A short checkpoint on multiplication, division, and fractions — pass at 70% or better on the first try.', courseId: g34MathCourse.id, sortOrder: 4, kind: 'CHECKPOINT', passThresholdPercent: 70 },
  });
  let g34MathCheckpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Multiplication, Division & Fractions', conceptId: g34MathCheckpoint.id } });
  if (!g34MathCheckpointLesson) {
    g34MathCheckpointLesson = await prisma.lesson.create({ data: { conceptId: g34MathCheckpoint.id, title: 'Checkpoint: Multiplication, Division & Fractions', description: "Let's see what you've learned!", sortOrder: 1, xpReward: 60 } });
    await prisma.card.create({ data: { lessonId: g34MathCheckpointLesson.id, title: 'Before You Start', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Do your best! Take your time with each problem.' } });
    const g34CheckpointQ1 = await makeQ(mathSubject.id, g3Level.id, 'What is 7 × 8?', [{ label: 'A', text: '56', correct: true }, { label: 'B', text: '54', correct: false }, { label: 'C', text: '64', correct: false }, { label: 'D', text: '48', correct: false }], '7 × 8 = 56.');
    await prisma.card.create({ data: { lessonId: g34MathCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 2, cardType: 'CHECKPOINT', content: 'Work it out, then tap the answer.', questionId: g34CheckpointQ1.id } });
    const g34CheckpointQ2 = await makeQ(mathSubject.id, g3Level.id, 'A garden has 6 equal rows of 5 flowers each. How many flowers in all?', [{ label: 'A', text: '30', correct: true }, { label: 'B', text: '11', correct: false }, { label: 'C', text: '25', correct: false }, { label: 'D', text: '35', correct: false }], '6 rows × 5 flowers = 30 flowers.');
    await prisma.card.create({ data: { lessonId: g34MathCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 3, cardType: 'CHECKPOINT', content: 'Read the problem, then tap the answer.', questionId: g34CheckpointQ2.id } });
  }

  console.log('✅ Seeded Grades 3-4 Math course');

  // ─── K-6 expansion: Grades 3-4 Language Arts ──────────────────────────────
  console.log('🌱 Seeding Grades 3-4 Language Arts course...');

  const g34LaCourse = await prisma.course.upsert({
    where: { slug: 'reading-and-grammar' },
    update: { gradeBand: 'G3_4', sortOrder: 3 },
    create: {
      learningSubjectId: laLearningSubject.id,
      title: 'Reading & Grammar',
      slug: 'reading-and-grammar',
      description: 'Find the main idea, make inferences, and learn the building blocks of grammar.',
      estimatedHours: 4,
      // DRAFT, not PUBLISHED: this course has no price and belongs to no
      // program, so publishing it puts a page in the catalog that nobody can
      // buy from — see the publish guard in CatalogService. Give it a price
      // or attach it to a program before publishing.
      status: 'DRAFT',
      sortOrder: 3,
      gradeBand: 'G3_4',
    },
  });

  const comprehensionChapter = await prisma.concept.upsert({
    where: { name: 'Reading Comprehension' },
    update: { courseId: g34LaCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Reading Comprehension', description: 'Understanding what you read.', courseId: g34LaCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let mainIdeaLesson = await prisma.lesson.findFirst({ where: { title: 'Finding the Main Idea', conceptId: comprehensionChapter.id } });
  if (!mainIdeaLesson) {
    mainIdeaLesson = await prisma.lesson.create({ data: { conceptId: comprehensionChapter.id, title: 'Finding the Main Idea', description: 'What is the passage really about?', sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: mainIdeaLesson.id, title: 'The Big Picture', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'The main idea is what a passage is mostly about, not just one small detail.' } });
    const mainIdeaQ1 = await makeQ(engSubject.id, g3Level.id, "'Ants live in colonies. They build tunnels, gather food, and care for their queen together.' What is this passage mostly about?", [{ label: 'A', text: 'How ants live and work together', correct: true }, { label: 'B', text: 'What a queen looks like', correct: false }, { label: 'C', text: 'Why ants are small', correct: false }, { label: 'D', text: 'Where tunnels are found', correct: false }], "The passage describes several ways ants live and work together as a colony.");
    await prisma.card.create({ data: { lessonId: mainIdeaLesson.id, title: 'Pick the Main Idea', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read the passage, then tap the main idea.', questionId: mainIdeaQ1.id } });
    const mainIdeaQ2 = await makeQ(engSubject.id, g3Level.id, "'Rain forests are home to millions of plants and animals. They also help clean the air we breathe.' What is this passage mostly about?", [{ label: 'A', text: 'Why rain forests matter', correct: true }, { label: 'B', text: 'How much it rains', correct: false }, { label: 'C', text: 'One type of animal', correct: false }, { label: 'D', text: 'The color of leaves', correct: false }], "The passage explains why rain forests are important — for wildlife and clean air.");
    await prisma.card.create({ data: { lessonId: mainIdeaLesson.id, title: 'Pick the Main Idea', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read the passage, then tap the main idea.', questionId: mainIdeaQ2.id } });
  }

  let inferencesLesson = await prisma.lesson.findFirst({ where: { title: 'Making Inferences', conceptId: comprehensionChapter.id } });
  if (!inferencesLesson) {
    inferencesLesson = await prisma.lesson.create({ data: { conceptId: comprehensionChapter.id, title: 'Making Inferences', description: 'Figure out what the text is hinting at.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: inferencesLesson.id, title: 'Reading Between the Lines', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'An inference is a smart guess based on clues, even when the answer is not stated directly.' } });
    const inferQ1 = await makeQ(engSubject.id, g3Level.id, "'Maria grabbed her umbrella and put on her raincoat before leaving the house.' What can you infer?", [{ label: 'A', text: 'It was raining or about to rain', correct: true }, { label: 'B', text: 'Maria was going swimming', correct: false }, { label: 'C', text: 'It was very sunny outside', correct: false }, { label: 'D', text: 'Maria was going to bed', correct: false }], "An umbrella and raincoat are clues that it was raining or about to rain.");
    await prisma.card.create({ data: { lessonId: inferencesLesson.id, title: 'Make the Inference', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read the clues, then tap your answer.', questionId: inferQ1.id } });
    const inferQ2 = await makeQ(engSubject.id, g3Level.id, "'Sam's stomach growled loudly as he stared at the clock, waiting for the lunch bell.' What can you infer?", [{ label: 'A', text: 'Sam was hungry', correct: true }, { label: 'B', text: 'Sam was tired', correct: false }, { label: 'C', text: 'Sam was scared', correct: false }, { label: 'D', text: 'Sam was cold', correct: false }], "A growling stomach and waiting for lunch are clues that Sam was hungry.");
    await prisma.card.create({ data: { lessonId: inferencesLesson.id, title: 'Make the Inference', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read the clues, then tap your answer.', questionId: inferQ2.id } });
  }

  const grammarChapter = await prisma.concept.upsert({
    where: { name: 'Grammar Basics' },
    update: { courseId: g34LaCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Grammar Basics', description: 'Nouns, verbs, and parts of speech.', courseId: g34LaCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let nounsVerbsLesson = await prisma.lesson.findFirst({ where: { title: 'Nouns and Verbs', conceptId: grammarChapter.id } });
  if (!nounsVerbsLesson) {
    nounsVerbsLesson = await prisma.lesson.create({ data: { conceptId: grammarChapter.id, title: 'Nouns and Verbs', description: 'Naming words and action words.', sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: nounsVerbsLesson.id, title: 'Naming and Doing', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A noun names a person, place, or thing. A verb shows an action.' } });
    const nounVerbQ1 = await makeQ(engSubject.id, g3Level.id, "In 'The dog barked loudly,' which word is the verb?", [{ label: 'A', text: 'barked', correct: true }, { label: 'B', text: 'dog', correct: false }, { label: 'C', text: 'loudly', correct: false }, { label: 'D', text: 'the', correct: false }], "'Barked' is the action the dog did, so it's the verb.");
    await prisma.card.create({ data: { lessonId: nounsVerbsLesson.id, title: 'Find the Word', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Read the sentence, then tap your answer.', questionId: nounVerbQ1.id } });
    const nounVerbQ2 = await makeQ(engSubject.id, g3Level.id, "In 'The teacher wrote on the board,' which word is the noun?", [{ label: 'A', text: 'teacher', correct: true }, { label: 'B', text: 'wrote', correct: false }, { label: 'C', text: 'on', correct: false }, { label: 'D', text: 'the', correct: false }], "'Teacher' names a person, so it's the noun.");
    await prisma.card.create({ data: { lessonId: nounsVerbsLesson.id, title: 'Find the Word', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Read the sentence, then tap your answer.', questionId: nounVerbQ2.id } });
  }

  let matchPartsOfSpeechLesson = await prisma.lesson.findFirst({ where: { title: 'Match Parts of Speech', conceptId: grammarChapter.id } });
  if (!matchPartsOfSpeechLesson) {
    matchPartsOfSpeechLesson = await prisma.lesson.create({ data: { conceptId: grammarChapter.id, title: 'Match Parts of Speech', description: 'Match each word to its part of speech.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: matchPartsOfSpeechLesson.id, title: 'Match Them Up', sortOrder: 1, cardType: 'CONCEPTUAL', content: "Let's match words to their part of speech." } });
    const matchSpeechQ = await prisma.question.create({
      data: {
        subjectId: engSubject.id,
        classId: g3Level.id,
        questionType: 'interactive',
        prompt: 'Match each word to its part of speech.',
        correctAnswer: null,
        widgetType: 'GRID_MATCHING',
        isGraded: true,
        explanation: "'Dog' and 'city' are nouns (naming words). 'Run' and 'jump' are verbs (action words).",
        hints: ['Ask yourself: does the word name something, or does it show an action?'],
        widgetConfig: {
          left: [
            { id: 'dog', text: 'dog' },
            { id: 'run', text: 'run' },
            { id: 'city', text: 'city' },
            { id: 'jump', text: 'jump' },
          ],
          right: [
            { id: 'noun-1', text: 'Noun' },
            { id: 'verb-1', text: 'Verb' },
            { id: 'noun-2', text: 'Noun' },
            { id: 'verb-2', text: 'Verb' },
          ],
          correctPairs: [['dog', 'noun-1'], ['run', 'verb-1'], ['city', 'noun-2'], ['jump', 'verb-2']],
        },
      },
    });
    await prisma.card.create({ data: { lessonId: matchPartsOfSpeechLesson.id, title: 'Match Them Up', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap a word, then tap its matching part of speech.', questionId: matchSpeechQ.id } });
  }

  const paragraphsChapter = await prisma.concept.upsert({
    where: { name: 'Writing Paragraphs' },
    update: { courseId: g34LaCourse.id, sortOrder: 3, kind: 'CHAPTER' },
    create: { name: 'Writing Paragraphs', description: 'Building a clear paragraph.', courseId: g34LaCourse.id, sortOrder: 3, kind: 'CHAPTER' },
  });

  let topicSentencesLesson = await prisma.lesson.findFirst({ where: { title: 'Topic Sentences', conceptId: paragraphsChapter.id } });
  if (!topicSentencesLesson) {
    topicSentencesLesson = await prisma.lesson.create({ data: { conceptId: paragraphsChapter.id, title: 'Topic Sentences', description: 'The sentence that tells what a paragraph is about.', sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: topicSentencesLesson.id, title: 'Starting Strong', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A topic sentence tells the reader what the whole paragraph will be about.' } });
    const topicQ1 = await makeQ(engSubject.id, g3Level.id, 'Which sentence would work best as a topic sentence for a paragraph about dogs?', [{ label: 'A', text: 'Dogs make wonderful pets for many reasons.', correct: true }, { label: 'B', text: 'My dog is brown.', correct: false }, { label: 'C', text: 'I fed my dog this morning.', correct: false }, { label: 'D', text: 'The park has a big tree.', correct: false }], "This sentence introduces the general topic — dogs as pets — that the rest of the paragraph can explain.");
    await prisma.card.create({ data: { lessonId: topicSentencesLesson.id, title: 'Pick the Topic Sentence', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Think about which sentence introduces the whole paragraph, then tap it.', questionId: topicQ1.id } });
    const topicQ2 = await makeQ(engSubject.id, g3Level.id, 'Which sentence would work best as a topic sentence for a paragraph about the ocean?', [{ label: 'A', text: 'The ocean is home to many amazing creatures.', correct: true }, { label: 'B', text: 'I saw a crab yesterday.', correct: false }, { label: 'C', text: 'The water was cold.', correct: false }, { label: 'D', text: 'We packed sandwiches.', correct: false }], "This sentence introduces the general topic — ocean creatures — that the paragraph would go on to describe.");
    await prisma.card.create({ data: { lessonId: topicSentencesLesson.id, title: 'Pick the Topic Sentence', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Think about which sentence introduces the whole paragraph, then tap it.', questionId: topicQ2.id } });
  }

  let sentenceOrderLesson = await prisma.lesson.findFirst({ where: { title: 'Putting Sentences in Order', conceptId: paragraphsChapter.id } });
  if (!sentenceOrderLesson) {
    sentenceOrderLesson = await prisma.lesson.create({ data: { conceptId: paragraphsChapter.id, title: 'Putting Sentences in Order', description: 'Good paragraphs follow a logical order.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: sentenceOrderLesson.id, title: 'What Comes First?', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A paragraph usually starts with the topic sentence, then gives details in order.' } });
    const orderQ1 = await makeQ(engSubject.id, g3Level.id, 'Which sentence should come FIRST in a paragraph about making a sandwich?', [{ label: 'A', text: 'First, gather two slices of bread.', correct: true }, { label: 'B', text: 'Finally, cut the sandwich in half.', correct: false }, { label: 'C', text: 'Then spread the peanut butter.', correct: false }, { label: 'D', text: 'Next, add the jelly.', correct: false }], "'First' signals this is the very first step.");
    await prisma.card.create({ data: { lessonId: sentenceOrderLesson.id, title: 'Pick the First Sentence', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Look for order-signal words, then tap the sentence that comes first.', questionId: orderQ1.id } });
    const orderQ2 = await makeQ(engSubject.id, g3Level.id, 'Which sentence should come LAST in a paragraph about planting a seed?', [{ label: 'A', text: 'Finally, water the soil every day until it sprouts.', correct: true }, { label: 'B', text: 'First, dig a small hole in the dirt.', correct: false }, { label: 'C', text: 'Next, place the seed in the hole.', correct: false }, { label: 'D', text: 'Then, cover the seed with soil.', correct: false }], "'Finally' signals this is the last step.");
    await prisma.card.create({ data: { lessonId: sentenceOrderLesson.id, title: 'Pick the Last Sentence', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Look for order-signal words, then tap the sentence that comes last.', questionId: orderQ2.id } });
  }

  const g34LaCheckpoint = await prisma.concept.upsert({
    where: { name: 'Reading & Grammar Checkpoint' },
    update: { courseId: g34LaCourse.id, sortOrder: 4, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: { name: 'Reading & Grammar Checkpoint', description: 'A short checkpoint on comprehension and grammar — pass at 70% or better on the first try.', courseId: g34LaCourse.id, sortOrder: 4, kind: 'CHECKPOINT', passThresholdPercent: 70 },
  });
  let g34LaCheckpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Reading & Grammar', conceptId: g34LaCheckpoint.id } });
  if (!g34LaCheckpointLesson) {
    g34LaCheckpointLesson = await prisma.lesson.create({ data: { conceptId: g34LaCheckpoint.id, title: 'Checkpoint: Reading & Grammar', description: "Let's see what you've learned!", sortOrder: 1, xpReward: 60 } });
    await prisma.card.create({ data: { lessonId: g34LaCheckpointLesson.id, title: 'Before You Start', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Do your best! Read each question carefully.' } });
    const g34LaCheckpointQ1 = await makeQ(engSubject.id, g3Level.id, "'Penguins cannot fly, but they are excellent swimmers who catch fish underwater.' What is this passage mostly about?", [{ label: 'A', text: 'How penguins swim to catch fish', correct: true }, { label: 'B', text: 'Why penguins are cold', correct: false }, { label: 'C', text: 'Where penguins sleep', correct: false }, { label: 'D', text: 'How tall penguins are', correct: false }], "The passage focuses on penguins swimming and catching fish.");
    await prisma.card.create({ data: { lessonId: g34LaCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 2, cardType: 'CHECKPOINT', content: 'Read the passage, then tap the main idea.', questionId: g34LaCheckpointQ1.id } });
    const g34LaCheckpointQ2 = await makeQ(engSubject.id, g3Level.id, "In 'The children played happily in the park,' which word is the verb?", [{ label: 'A', text: 'played', correct: true }, { label: 'B', text: 'children', correct: false }, { label: 'C', text: 'happily', correct: false }, { label: 'D', text: 'park', correct: false }], "'Played' is the action the children did, so it's the verb.");
    await prisma.card.create({ data: { lessonId: g34LaCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 3, cardType: 'CHECKPOINT', content: 'Read the sentence, then tap your answer.', questionId: g34LaCheckpointQ2.id } });
  }

  console.log('✅ Seeded Grades 3-4 Language Arts course');

  // ─── K-6 expansion: Grades 5-6 Language Arts ──────────────────────────────
  // The last increment of the K-6 v1 scope — Math at this band already
  // exists (algebra-foundations, fractions-and-algebra-basics,
  // percentages-and-ratios are all tagged G5_6), so only Language Arts is
  // net-new content here, per the K-6 plan's sequencing note.
  console.log('🌱 Seeding Grades 5-6 Language Arts course...');

  const g56LaCourse = await prisma.course.upsert({
    where: { slug: 'analytical-reading-and-writing' },
    update: { gradeBand: 'G5_6', sortOrder: 5 },
    create: {
      learningSubjectId: laLearningSubject.id,
      title: 'Analytical Reading & Writing',
      slug: 'analytical-reading-and-writing',
      description: "Dig into an author's purpose and theme, and structure multi-paragraph writing.",
      estimatedHours: 4,
      // DRAFT for the same reason as reading-and-grammar above: unpriced and
      // in no program, so it cannot be bought by any route.
      status: 'DRAFT',
      sortOrder: 5,
      gradeBand: 'G5_6',
    },
  });

  const analyticalReadingChapter = await prisma.concept.upsert({
    where: { name: 'Analytical Reading' },
    update: { courseId: g56LaCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Analytical Reading', description: "Reading for an author's purpose and theme.", courseId: g56LaCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let authorsPurposeLesson = await prisma.lesson.findFirst({ where: { title: "Author's Purpose", conceptId: analyticalReadingChapter.id } });
  if (!authorsPurposeLesson) {
    authorsPurposeLesson = await prisma.lesson.create({ data: { conceptId: analyticalReadingChapter.id, title: "Author's Purpose", description: 'Why did the author write this?', sortOrder: 1, xpReward: 30 } });
    await prisma.card.create({ data: { lessonId: authorsPurposeLesson.id, title: 'Why Authors Write', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Authors usually write to persuade, inform, or entertain. Look at word choice and structure for clues.' } });
    const purposeQ1 = await makeQ(engSubject.id, g5Level.id, "A magazine article lists statistics and expert quotes about climate change. What is the author's main purpose?", [{ label: 'A', text: 'To inform', correct: true }, { label: 'B', text: 'To entertain', correct: false }, { label: 'C', text: 'To persuade readers to buy something', correct: false }, { label: 'D', text: 'To tell a fictional story', correct: false }], "Statistics and expert quotes are tools used to inform readers with facts.");
    await prisma.card.create({ data: { lessonId: authorsPurposeLesson.id, title: 'Identify the Purpose', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Think about the clues, then tap your answer.', questionId: purposeQ1.id } });
    const purposeQ2 = await makeQ(engSubject.id, g5Level.id, 'An ad says "Buy our shoes — they will change your life!" What is the purpose of this text?', [{ label: 'A', text: 'To persuade', correct: true }, { label: 'B', text: 'To inform', correct: false }, { label: 'C', text: 'To entertain with a story', correct: false }, { label: 'D', text: 'To give instructions', correct: false }], "The exaggerated claim is meant to persuade you to buy the shoes.");
    await prisma.card.create({ data: { lessonId: authorsPurposeLesson.id, title: 'Identify the Purpose', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Think about the clues, then tap your answer.', questionId: purposeQ2.id } });
  }

  let identifyingThemeLesson = await prisma.lesson.findFirst({ where: { title: 'Identifying Theme', conceptId: analyticalReadingChapter.id } });
  if (!identifyingThemeLesson) {
    identifyingThemeLesson = await prisma.lesson.create({ data: { conceptId: analyticalReadingChapter.id, title: 'Identifying Theme', description: 'What lesson or message does the story teach?', sortOrder: 2, xpReward: 30 } });
    await prisma.card.create({ data: { lessonId: identifyingThemeLesson.id, title: 'The Bigger Lesson', sortOrder: 1, cardType: 'CONCEPTUAL', content: "A theme is the underlying message or lesson of a story — bigger than just what happens in the plot." } });
    const themeQ1 = await makeQ(engSubject.id, g5Level.id, 'In a story, a boy refuses to give up practicing the piano even after many failed recitals, and finally succeeds. What is the theme?', [{ label: 'A', text: 'Perseverance leads to success', correct: true }, { label: 'B', text: 'Piano lessons are expensive', correct: false }, { label: 'C', text: 'Recitals happen in the spring', correct: false }, { label: 'D', text: 'Music teachers are strict', correct: false }], "The story's message is about not giving up — perseverance.");
    await prisma.card.create({ data: { lessonId: identifyingThemeLesson.id, title: 'Find the Theme', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Think about the underlying message, then tap your answer.', questionId: themeQ1.id } });
    const themeQ2 = await makeQ(engSubject.id, g5Level.id, 'In a fable, a slow tortoise beats a fast but overconfident hare in a race. What is the theme?', [{ label: 'A', text: 'Slow and steady wins the race', correct: true }, { label: 'B', text: 'Hares are faster than tortoises', correct: false }, { label: 'C', text: 'Races should be held outdoors', correct: false }, { label: 'D', text: 'Tortoises live a long time', correct: false }], "The classic message of this fable is that steady effort beats overconfidence.");
    await prisma.card.create({ data: { lessonId: identifyingThemeLesson.id, title: 'Find the Theme', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Think about the underlying message, then tap your answer.', questionId: themeQ2.id } });
  }

  const writingStructureChapter = await prisma.concept.upsert({
    where: { name: 'Multi-Paragraph Writing' },
    update: { courseId: g56LaCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Multi-Paragraph Writing', description: 'Planning a piece of writing with a clear main idea and organised paragraphs.', courseId: g56LaCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let thesisStatementsLesson = await prisma.lesson.findFirst({ where: { title: 'Thesis Statements', conceptId: writingStructureChapter.id } });
  if (!thesisStatementsLesson) {
    thesisStatementsLesson = await prisma.lesson.create({ data: { conceptId: writingStructureChapter.id, title: 'Thesis Statements', description: 'The sentence that states your main argument.', sortOrder: 1, xpReward: 30 } });
    await prisma.card.create({ data: { lessonId: thesisStatementsLesson.id, title: 'Making Your Point', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A thesis statement clearly states the main argument or point of an entire essay, usually in the introduction.' } });
    const thesisQ1 = await makeQ(engSubject.id, g5Level.id, 'Which sentence works best as a thesis statement for an essay arguing that school days should start later?', [{ label: 'A', text: 'School days should start later because students learn better when well-rested.', correct: true }, { label: 'B', text: 'I woke up at 7am today.', correct: false }, { label: 'C', text: 'Some schools start at 8am.', correct: false }, { label: 'D', text: 'Sleep is important for health.', correct: false }], 'This sentence states a clear, arguable position that the rest of the essay would support.');
    await prisma.card.create({ data: { lessonId: thesisStatementsLesson.id, title: 'Pick the Thesis', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Look for the sentence that states a clear argument, then tap it.', questionId: thesisQ1.id } });
    const thesisQ2 = await makeQ(engSubject.id, g5Level.id, 'Which sentence works best as a thesis statement for an essay about the benefits of recycling?', [{ label: 'A', text: 'Recycling benefits communities by reducing waste and saving natural resources.', correct: true }, { label: 'B', text: 'My town has blue recycling bins.', correct: false }, { label: 'C', text: 'I recycled a can yesterday.', correct: false }, { label: 'D', text: 'Plastic takes years to break down.', correct: false }], 'This sentence states a clear, arguable claim that the essay could support with evidence.');
    await prisma.card.create({ data: { lessonId: thesisStatementsLesson.id, title: 'Pick the Thesis', sortOrder: 3, cardType: 'INTERACTIVE', content: 'Look for the sentence that states a clear argument, then tap it.', questionId: thesisQ2.id } });
  }

  let organizingParagraphsLesson = await prisma.lesson.findFirst({ where: { title: 'Organizing Paragraphs', conceptId: writingStructureChapter.id } });
  if (!organizingParagraphsLesson) {
    organizingParagraphsLesson = await prisma.lesson.create({ data: { conceptId: writingStructureChapter.id, title: 'Organizing Paragraphs', description: 'Match each paragraph type to its job in an essay.', sortOrder: 2, xpReward: 30 } });
    await prisma.card.create({ data: { lessonId: organizingParagraphsLesson.id, title: 'Every Paragraph Has a Job', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A well-organized essay has an introduction, body paragraphs with evidence, and a conclusion — each with a different job.' } });
    const matchParagraphQ = await prisma.question.create({
      data: {
        subjectId: engSubject.id,
        classId: g5Level.id,
        questionType: 'interactive',
        prompt: 'Match each paragraph type to its job in an essay.',
        correctAnswer: null,
        widgetType: 'GRID_MATCHING',
        isGraded: true,
        explanation: 'The introduction hooks the reader and states the thesis, body paragraphs each give one piece of evidence, and the conclusion sums up the argument.',
        hints: ['Think about where each paragraph type appears in an essay — start, middle, or end.'],
        widgetConfig: {
          left: [
            { id: 'intro', text: 'Introduction' },
            { id: 'body', text: 'Body Paragraph' },
            { id: 'conclusion', text: 'Conclusion' },
          ],
          right: [
            { id: 'intro-job', text: 'States the thesis and hooks the reader' },
            { id: 'body-job', text: 'Gives one piece of evidence in detail' },
            { id: 'conclusion-job', text: 'Sums up the argument' },
          ],
          correctPairs: [['intro', 'intro-job'], ['body', 'body-job'], ['conclusion', 'conclusion-job']],
        },
      },
    });
    await prisma.card.create({ data: { lessonId: organizingParagraphsLesson.id, title: 'Match Them Up', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap a paragraph type, then tap its matching job.', questionId: matchParagraphQ.id } });
  }

  const g56LaCheckpoint = await prisma.concept.upsert({
    where: { name: 'Analytical Reading & Writing Checkpoint' },
    update: { courseId: g56LaCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
    create: { name: 'Analytical Reading & Writing Checkpoint', description: 'A short checkpoint on analytical reading and essay structure — pass at 70% or better on the first try.', courseId: g56LaCourse.id, sortOrder: 3, kind: 'CHECKPOINT', passThresholdPercent: 70 },
  });
  let g56LaCheckpointLesson = await prisma.lesson.findFirst({ where: { title: 'Checkpoint: Analytical Reading & Writing', conceptId: g56LaCheckpoint.id } });
  if (!g56LaCheckpointLesson) {
    g56LaCheckpointLesson = await prisma.lesson.create({ data: { conceptId: g56LaCheckpoint.id, title: 'Checkpoint: Analytical Reading & Writing', description: "Let's see what you've learned!", sortOrder: 1, xpReward: 65 } });
    await prisma.card.create({ data: { lessonId: g56LaCheckpointLesson.id, title: 'Before You Start', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Do your best! Think carefully about each question.' } });
    const g56LaCheckpointQ1 = await makeQ(engSubject.id, g5Level.id, 'A cookbook explains step by step how to bake bread. What is the main purpose of this text?', [{ label: 'A', text: 'To inform / instruct', correct: true }, { label: 'B', text: 'To persuade', correct: false }, { label: 'C', text: 'To entertain with a story', correct: false }, { label: 'D', text: 'To express an opinion', correct: false }], 'Step-by-step instructions are meant to inform and instruct the reader.');
    await prisma.card.create({ data: { lessonId: g56LaCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 2, cardType: 'CHECKPOINT', content: 'Think about the clues, then tap your answer.', questionId: g56LaCheckpointQ1.id } });
    const g56LaCheckpointQ2 = await makeQ(engSubject.id, g5Level.id, 'Which sentence works best as a thesis statement for an essay about the importance of libraries?', [{ label: 'A', text: 'Libraries strengthen communities by providing free access to knowledge and resources.', correct: true }, { label: 'B', text: 'I visited the library on Tuesday.', correct: false }, { label: 'C', text: 'The library has many books.', correct: false }, { label: 'D', text: 'Some libraries are open late.', correct: false }], 'This sentence states a clear, arguable claim about why libraries matter.');
    await prisma.card.create({ data: { lessonId: g56LaCheckpointLesson.id, title: 'Checkpoint Question', sortOrder: 3, cardType: 'CHECKPOINT', content: 'Look for a clear argument, then tap your answer.', questionId: g56LaCheckpointQ2.id } });
  }

  console.log('✅ Seeded Grades 5-6 Language Arts course');

  // ─── New widget types demo: COORDINATE_PLOTTER + SHAPE_SHADING ───────────────
  // A standalone course, deliberately not gated behind or inserted into
  // algebra-foundations' existing chapter sequence — that sequence's
  // CHECKPOINT gating has been exercised repeatedly this session and
  // shouldn't be disturbed by unrelated new-widget-type verification content.
  console.log('🌱 Seeding new-widget-types demo course...');

  const widgetDemoCourse = await prisma.course.upsert({
    where: { slug: 'coordinate-and-shape-practice' },
    update: { gradeBand: 'G3_4', sortOrder: -2 },
    create: {
      learningSubjectId: mathLearningSubject.id,
      title: 'Coordinate & Shape Practice',
      slug: 'coordinate-and-shape-practice',
      description: 'Plot points on a grid and shade shapes to represent fractions.',
      estimatedHours: 1,
      // DRAFT for the same reason as the two Language Arts courses above:
      // unpriced and in no program, so nobody can buy it.
      //
      // NOTE this has a side effect worth knowing about: `listCourses` hides
      // DRAFT from every non-staff caller, so this course no longer appears
      // in the mobile "Keep learning" slot it was deliberately positioned to
      // win (see sortOrder below). Give it a price to put it back in the
      // student catalog — flipping it to PUBLISHED alone is now refused.
      status: 'DRAFT',
      // Negative so that, when this course is published, it wins
      // `courses?.[0]` — the mobile home screen's only "Keep learning" pick —
      // ahead of everything else, including the K-6 pilot course. Same
      // reasoning as alphabet-and-phonics-basics above.
      sortOrder: -2,
      gradeBand: 'G3_4',
    },
  });

  const coordinateChapter = await prisma.concept.upsert({
    where: { name: 'Plotting Points' },
    update: { courseId: widgetDemoCourse.id, sortOrder: 1, kind: 'CHAPTER' },
    create: { name: 'Plotting Points', description: 'Tap grid intersections to plot coordinates.', courseId: widgetDemoCourse.id, sortOrder: 1, kind: 'CHAPTER' },
  });

  let triangleLesson = await prisma.lesson.findFirst({ where: { title: 'Plot a Triangle', conceptId: coordinateChapter.id } });
  if (!triangleLesson) {
    triangleLesson = await prisma.lesson.create({ data: { conceptId: coordinateChapter.id, title: 'Plot a Triangle', description: 'Plot the three vertices of a triangle.', sortOrder: 1, xpReward: 30 } });
    await prisma.card.create({ data: { lessonId: triangleLesson.id, title: 'Plotting Vertices', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A triangle has 3 corners, called vertices. Tap the grid to plot each one.' } });
    const plotterQ = await prisma.question.create({
      data: {
        subjectId: mathSubject.id,
        classId: gradeLevel.id,
        questionType: 'interactive',
        prompt: 'Plot the points (2, 2), (-2, 2), and (0, -2) to form a triangle.',
        correctAnswer: null,
        widgetType: 'COORDINATE_PLOTTER',
        isGraded: true,
        explanation: 'Each point is plotted by counting right/left for x, then up/down for y, from the origin.',
        hints: ['Start at the center (0, 0), then count over and up or down.'],
        widgetConfig: {
          xRange: [-5, 5],
          yRange: [-5, 5],
          gridStep: 1,
          correctPoints: [
            { x: 2, y: 2 },
            { x: -2, y: 2 },
            { x: 0, y: -2 },
          ],
          tolerance: 0.3,
        },
      },
    });
    await prisma.card.create({ data: { lessonId: triangleLesson.id, title: 'Plot the Triangle', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap the three points listed above.', questionId: plotterQ.id } });
  }

  const shadingChapter = await prisma.concept.upsert({
    where: { name: 'Shading Shapes' },
    update: { courseId: widgetDemoCourse.id, sortOrder: 2, kind: 'CHAPTER' },
    create: { name: 'Shading Shapes', description: 'Tap regions to shade a fraction of a shape.', courseId: widgetDemoCourse.id, sortOrder: 2, kind: 'CHAPTER' },
  });

  let barLesson = await prisma.lesson.findFirst({ where: { title: 'Color a Bar', conceptId: shadingChapter.id } });
  if (!barLesson) {
    barLesson = await prisma.lesson.create({ data: { conceptId: shadingChapter.id, title: 'Color a Bar', description: 'Shade part of a bar to match a fraction.', sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: barLesson.id, title: 'Fraction Bars', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A bar split into equal parts is another way to show a fraction.' } });
    const barQ = await prisma.question.create({
      data: {
        subjectId: mathSubject.id,
        classId: gradeLevel.id,
        questionType: 'interactive',
        prompt: 'Color 2/4 of the bar.',
        correctAnswer: null,
        widgetType: 'SHAPE_SHADING',
        isGraded: true,
        explanation: 'Any 2 connected segments out of the 4 shade exactly half the bar.',
        hints: ['Tap two segments next to each other.'],
        widgetConfig: {
          configVersion: 2,
          mode: 'fixed',
          shape: { kind: 'bar', regions: 4 },
          targetNumerator: 2,
          requireContiguous: true,
        },
      },
    });
    await prisma.card.create({ data: { lessonId: barLesson.id, title: 'Shade the Bar', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap segments to color them in.', questionId: barQ.id } });
  }

  let hexLesson = await prisma.lesson.findFirst({ where: { title: 'Color a Hexagon', conceptId: shadingChapter.id } });
  if (!hexLesson) {
    hexLesson = await prisma.lesson.create({ data: { conceptId: shadingChapter.id, title: 'Color a Hexagon', description: 'Shade part of a hexagon to match a fraction.', sortOrder: 2, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: hexLesson.id, title: 'Shapes Show Fractions Too', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A shape split into equal wedges can show a fraction, just like a bar or a pizza.' } });
    const hexQ = await prisma.question.create({
      data: {
        subjectId: mathSubject.id,
        classId: gradeLevel.id,
        questionType: 'interactive',
        prompt: 'Color 1/2 of the hexagon.',
        correctAnswer: null,
        widgetType: 'SHAPE_SHADING',
        isGraded: true,
        explanation: 'A hexagon has 6 equal wedges — shading any 3 connected wedges covers exactly half.',
        hints: ['Tap three wedges next to each other.'],
        widgetConfig: {
          configVersion: 2,
          mode: 'fixed',
          shape: { kind: 'polygon', regions: 6 },
          targetNumerator: 3,
          requireContiguous: true,
        },
      },
    });
    await prisma.card.create({ data: { lessonId: hexLesson.id, title: 'Shade the Hexagon', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Tap wedges to color them in.', questionId: hexQ.id } });
  }

  const anglesChapter = await prisma.concept.upsert({
    where: { name: 'Measuring Angles' },
    update: { courseId: widgetDemoCourse.id, sortOrder: 3, kind: 'CHAPTER' },
    create: { name: 'Measuring Angles', description: 'Drag a ray to set an angle in degrees.', courseId: widgetDemoCourse.id, sortOrder: 3, kind: 'CHAPTER' },
  });

  let acuteAngleLesson = await prisma.lesson.findFirst({ where: { title: 'Set an Acute Angle', conceptId: anglesChapter.id } });
  if (!acuteAngleLesson) {
    acuteAngleLesson = await prisma.lesson.create({ data: { conceptId: anglesChapter.id, title: 'Set an Acute Angle', description: 'Drag a ray from the baseline to make a target angle.', sortOrder: 1, xpReward: 25 } });
    await prisma.card.create({ data: { lessonId: acuteAngleLesson.id, title: 'What Is an Angle?', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'An angle is formed where two rays meet at a shared point, called the vertex. Angles are measured in degrees — a full turn is 360°, and an angle smaller than 90° is called acute.' } });
    const angleQ = await prisma.question.create({
      data: {
        subjectId: mathSubject.id,
        classId: g3Level.id,
        questionType: 'short_answer',
        prompt: 'Drag the ray to make a 60° angle from the baseline.',
        correctAnswer: null,
        widgetType: 'ANGLE_PROTRACTOR',
        isGraded: true,
        explanation: 'The ray needs to sweep 60° counter-clockwise from the fixed baseline ray — a bit more than half of a right angle.',
        hints: ['A right angle is 90° — 60° is a little less than that.'],
        widgetConfig: {
          configVersion: 2,
          mode: 'fixed',
          correctAngle: 60,
          tolerance: 5,
          classification: 'acute',
        },
      },
    });
    await prisma.card.create({ data: { lessonId: acuteAngleLesson.id, title: 'Set the Angle', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Drag the slider or type a value to set the angle.', questionId: angleQ.id } });
  }

  const dragDropChapter = await prisma.concept.upsert({
    where: { name: 'Matching by Dragging' },
    update: { courseId: widgetDemoCourse.id, sortOrder: 4, kind: 'CHAPTER' },
    create: { name: 'Matching by Dragging', description: 'Drag a label from the pool onto the slot where it belongs.', courseId: widgetDemoCourse.id, sortOrder: 4, kind: 'CHAPTER' },
  });

  let animalHomesLesson = await prisma.lesson.findFirst({ where: { title: 'Animal Homes', conceptId: dragDropChapter.id } });
  if (!animalHomesLesson) {
    animalHomesLesson = await prisma.lesson.create({ data: { conceptId: dragDropChapter.id, title: 'Animal Homes', description: 'Drag each animal to where it lives.', sortOrder: 1, xpReward: 20 } });
    await prisma.card.create({ data: { lessonId: animalHomesLesson.id, title: 'Every Animal Has a Home', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'Different animals live in different places. Fish live in water, and birds build nests.' } });
    const dragDropQ = await prisma.question.create({
      data: {
        subjectId: sciSubject.id,
        classId: gradeLevel.id,
        questionType: 'short_answer',
        prompt: 'Drag each animal to its correct home.',
        correctAnswer: null,
        widgetType: 'DRAG_AND_DROP_LABELS',
        isGraded: true,
        explanation: 'A fish breathes through gills and lives in water. A bird builds a nest to lay its eggs.',
        hints: ['Think about which animal needs to breathe underwater.'],
        widgetConfig: {
          configVersion: 2,
          mode: 'fixed',
          labels: ['Fish', 'Bird'],
          targets: [
            { id: 'water', placeholder: 'Lives in water', correctLabel: 'Fish' },
            { id: 'nest', placeholder: 'Lives in a nest', correctLabel: 'Bird' },
          ],
        },
      },
    });
    await prisma.card.create({ data: { lessonId: animalHomesLesson.id, title: 'Drag Each Animal Home', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Drag or tap items below to match.', questionId: dragDropQ.id } });
  }

  const picturesChapter = await prisma.concept.upsert({
    where: { name: 'Shapes with Pictures' },
    update: { courseId: widgetDemoCourse.id, sortOrder: 5, kind: 'CHAPTER' },
    create: { name: 'Shapes with Pictures', description: 'Questions with a picture in the prompt, not just text.', courseId: widgetDemoCourse.id, sortOrder: 5, kind: 'CHAPTER' },
  });

  let namePolygonLesson = await prisma.lesson.findFirst({ where: { title: 'Name the Polygon', conceptId: picturesChapter.id } });
  if (!namePolygonLesson) {
    namePolygonLesson = await prisma.lesson.create({ data: { conceptId: picturesChapter.id, title: 'Name the Polygon', description: 'Look at a shape and answer a question about it.', sortOrder: 1, xpReward: 20 } });
    await prisma.card.create({ data: { lessonId: namePolygonLesson.id, title: 'Polygons Have Names', sortOrder: 1, cardType: 'CONCEPTUAL', content: 'A polygon is a flat shape with straight sides. Its name comes from how many sides it has — a hexagon has six.' } });
    // A self-contained SVG data URI rather than an uploaded file: seed data
    // has no running upload pipeline behind it (the seed script and the API
    // container don't share a filesystem for LocalStorageService's uploads/
    // directory), and a data: URI needs nothing from either — it renders the
    // same way a real uploaded image would (see resolveUploadUrl on both
    // clients), which is the one thing this lesson exists to demonstrate.
    const hexagonImage =
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y4ZmFmYyIvPjxwb2x5Z29uIHBvaW50cz0iMTAwLDIyIDE2Ny41NSw2MSAxNjcuNTUsMTM5IDEwMCwxNzggMzIuNDUsMTM5IDMyLjQ1LDYxIiBmaWxsPSIjYmZkYmZlIiBzdHJva2U9IiMxZDRlZDgiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==';
    const polygonQ = await makeQ(
      mathSubject.id,
      g3Level.id,
      'How many sides does this polygon have?',
      [
        { label: 'A', text: '5', correct: false },
        { label: 'B', text: '6', correct: true },
        { label: 'C', text: '7', correct: false },
      ],
      'Count each straight edge going around the shape once — this one has six, so it is a hexagon.',
      hexagonImage,
    );
    await prisma.card.create({ data: { lessonId: namePolygonLesson.id, title: 'Count the Sides', sortOrder: 2, cardType: 'INTERACTIVE', content: 'Look at the shape above, then pick your answer.', questionId: polygonQ.id } });
  }

  console.log('✅ Seeded new-widget-types demo course');

  // ─── Phase 3.5: Fully-unlocked test account (Charlotte) ──────────────────────
  // Seed-data only — no debug bypass code. Re-visiting a completed lesson
  // still creates a fresh LessonAttempt (lessons.service.ts's getLessonFlow/
  // submitCardResponse only look for an IN_PROGRESS one), so this doesn't
  // make her account read-only for hands-on testing.
  console.log('🌱 Seeding fully-unlocked test account (Charlotte)...');

  if (charlotteProfile) {
    // Queried by conceptId rather than a hand-maintained lesson list — a
    // concept only counts as "done" once *every* one of its lessons has a
    // COMPLETED attempt (progression.service.ts's computeConceptDoneMap), so
    // any stray lesson under these concepts (e.g. leftover authoring-UI test
    // content unrelated to this seed) would otherwise silently keep the
    // concept — and everything gated behind it — locked.
    const gatingConceptIds = [
      variablesChapter.id, linearEquationsChapter.id, practiceChapter.id, checkpointChapter.id,
      fractionsConc.id, algebraConc.id, fractionsPracticeChapter.id, fractionsCheckpoint.id,
    ];
    const allGatingLessons = await prisma.lesson.findMany({ where: { conceptId: { in: gatingConceptIds } } });
    for (const lesson of allGatingLessons) {
      const existing = await prisma.lessonAttempt.findFirst({ where: { lessonId: lesson.id, studentProfileId: charlotteProfile.id } });
      if (!existing) {
        await prisma.lessonAttempt.create({ data: { lessonId: lesson.id, studentProfileId: charlotteProfile.id, status: 'COMPLETED', xpEarned: lesson.xpReward, startedAt: new Date('2026-09-10'), completedAt: new Date('2026-09-10'), timeSpentSeconds: 300 } });
      } else if (existing.status !== 'COMPLETED') {
        await prisma.lessonAttempt.update({ where: { id: existing.id }, data: { status: 'COMPLETED', completedAt: new Date('2026-09-10') } });
      }
    }

    // First-try-correct StudentCardResponse rows for the two new checkpoint
    // cards, so computeConceptDoneMap's pass-threshold check succeeds too.
    for (const checkpointLessonRow of [fracCheckpointLesson]) {
      if (!checkpointLessonRow) continue;
      const attempt = await prisma.lessonAttempt.findFirst({ where: { lessonId: checkpointLessonRow.id, studentProfileId: charlotteProfile.id } });
      const card = await prisma.card.findFirst({ where: { lessonId: checkpointLessonRow.id, cardType: 'CHECKPOINT' } });
      if (attempt && card) {
        const existingResponse = await prisma.studentCardResponse.findFirst({ where: { lessonAttemptId: attempt.id, cardId: card.id } });
        if (!existingResponse) {
          await prisma.studentCardResponse.create({ data: { lessonAttemptId: attempt.id, cardId: card.id, isCorrect: true, attemptsCount: 1 } });
        }
      }
    }

    // High XP + streak — pure threshold checks in gamification.service.ts's
    // getBadges(), so this alone earns all 6 badges (the two lesson-count
    // badges are already covered by the completions above).
    await prisma.studentExperience.upsert({
      where: { studentProfileId: charlotteProfile.id },
      update: { totalXp: 1600, level: 8 },
      create: { studentProfileId: charlotteProfile.id, totalXp: 1600, level: 8, nextLevelXp: 500 },
    });
    await prisma.studentStreak.upsert({
      where: { studentProfileId: charlotteProfile.id },
      update: { currentStreak: 10, longestStreak: 15 },
      create: { studentProfileId: charlotteProfile.id, currentStreak: 10, longestStreak: 15, lastActiveDate: new Date('2026-11-01'), streakCharges: 1 },
    });

    // Real pending (unsubmitted) homework — every existing Homework row for
    // Charlotte's classes was already graded, leaving nothing to exercise
    // the actual submission flow with. One per class she doesn't already
    // have a homework in, so the "Due" list has real variety to tap into.
    const pendingHomeworkSpecs = [
      { title: 'Times Tables Practice 2', batch: dsaClass, description: 'Practise the 3, 4 and 6 times tables, then check them with a partner.', dueDate: new Date('2026-08-20'), maxPoints: 100 },
      { title: 'Sorting & Patterns Quiz Prep', batch: algClass, description: 'Put three sets of numbers in order from smallest to largest, then say what comes next.', dueDate: new Date('2026-08-13'), maxPoints: 50 },
      { title: 'Essay: Persuasive Writing', batch: engClass, description: 'Write a 500-word persuasive essay on a topic of your choice.', dueDate: new Date('2026-08-18'), maxPoints: 100 },
    ];
    for (const spec of pendingHomeworkSpecs) {
      const existingHw = await prisma.homework.findFirst({ where: { title: spec.title, batchId: spec.batch.id } });
      if (!existingHw) {
        await prisma.homework.create({ data: { batchId: spec.batch.id, title: spec.title, description: spec.description, dueDate: spec.dueDate, maxPoints: spec.maxPoints, recordedById: mitchellUser.id } });
      }
    }

    // Dual profile — Charlotte also holds a GuardianProfile watching Aria, a
    // deliberately test-only secondary-guardian pairing (not a real family
    // relationship) so one login reaches both the student and guardian views.
    const charlotteGuardianProfile = await prisma.guardianProfile.upsert({
      where: { userId: charlotteProfile.userId },
      update: {},
      create: { userId: charlotteProfile.userId, fullName: 'Charlotte Harris', email: 'charlotte@example.com', phone: '(555) 019-8832', status: 'ACTIVE' },
    });
    // A GuardianProfile row alone doesn't grant guardian-scoped API access —
    // /parent/* is @Roles('GUARDIAN') gated, so the role has to be assigned
    // too (mirrors every other guardian account below).
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: charlotteProfile.userId, roleId: guardianRole.id } }, update: {}, create: { userId: charlotteProfile.userId, roleId: guardianRole.id } });
    if (ariaProfile) {
      const existingRel = await prisma.guardianStudentRelationship.findFirst({ where: { guardianProfileId: charlotteGuardianProfile.id, studentProfileId: ariaProfile.id } });
      if (!existingRel) {
        await prisma.guardianStudentRelationship.create({ data: { guardianProfileId: charlotteGuardianProfile.id, studentProfileId: ariaProfile.id, relationshipType: 'OTHER', isPrimary: false, hasFinancialResponsibility: false, hasAcademicAccess: true, hasEmergencyContact: false } });
      }
    }
  }

  console.log('✅ Seeded fully-unlocked test account');

  // ─── Program <-> Course wiring ──────────────────────────────────────────────
  // Exercises both shapes the taxonomy supports: an academic Program hanging
  // off a Class, and a standalone bundle with `classId: null` that sits outside
  // the Class tree entirely (the K-6 micro-course packs).
  const linkProgramCourse = async (
    programId: string,
    courseId: string,
    sortOrder: number,
  ) => {
    await prisma.programCourse.upsert({
      where: { programId_courseId: { programId, courseId } },
      update: { sortOrder },
      create: { programId, courseId, sortOrder, isRequired: true },
    });
  };

  // Grade 2 -> Early Years Foundation -> 3 courses
  await linkProgramCourse(program.id, alphabetCourse.id, 0);
  await linkProgramCourse(program.id, preKMathCourse.id, 1);
  await linkProgramCourse(program.id, algebraCourse.id, 2);

  // Class 10 -> BSc Mathematics -> 2 courses. `fractionsCourse` is deliberately
  // shared with no other program here, but the join exists precisely so a
  // course CAN sit in several programs without being duplicated.
  await linkProgramCourse(mathProgram.id, fractionsCourse.id, 0);
  await linkProgramCourse(mathProgram.id, percentCourse.id, 1);

  // Standalone one-time bundle: no Class, priced above the $9 sellable floor
  // and below the a-la-carte sum of its parts.
  const g12Bundle = await prisma.program.upsert({
    where: { code: 'KIDS-G1-2' },
    update: {
      classId: null,
      status: 'PUBLISHED',
      deliveryMode: 'SELF_PACED',
      priceOneTimeCents: 4900,
    },
    create: {
      name: 'Grade 1-2 Complete',
      code: 'KIDS-G1-2',
      slug: 'grade-1-2-complete',
      classId: null,
      shortDescription:
        'Every Grade 1-2 maths and reading course in one one-time purchase.',
      status: 'PUBLISHED',
      deliveryMode: 'SELF_PACED',
      priceOneTimeCents: 4900,
    },
  });
  await linkProgramCourse(g12Bundle.id, g12MathCourse.id, 0);
  await linkProgramCourse(g12Bundle.id, g12LaCourse.id, 1);

  // The same courses stay individually sellable at the $19 standalone floor,
  // so the bundle is the obviously better deal.
  for (const c of [g12MathCourse, g12LaCourse]) {
    await prisma.course.update({
      where: { id: c.id },
      data: { priceOneTimeCents: 1900 },
    });
  }

  console.log('✅ Seeded program/course taxonomy links');

  // ─── Batches & teaching staff ───────────────────────────────────────────────
  // A LIVE course is unsellable without an open cohort, so the demo needs one.
  // `courseId` here is the weld that finally joins the catalogue tree to the
  // operational one — before it, Batch pointed only at a Term.
  const liveCourse = g34MathCourse;
  await prisma.course.update({
    where: { id: liveCourse.id },
    data: { deliveryMode: 'LIVE', priceOneTimeCents: 4900 },
  });

  const batchStart = new Date();
  batchStart.setDate(batchStart.getDate() + 14);
  const batchEnd = new Date(batchStart);
  batchEnd.setMonth(batchEnd.getMonth() + 3);
  const batchDeadline = new Date(batchStart);
  batchDeadline.setDate(batchDeadline.getDate() - 1);

  const leadTeacher = await prisma.teacherProfile.findFirst({
    where: { deletedAt: null },
    select: { id: true },
  });

  await prisma.batch.upsert({
    where: { code: 'G34-MATH-LIVE-1' },
    update: {
      courseId: liveCourse.id,
      startDate: batchStart,
      endDate: batchEnd,
      enrollmentDeadline: batchDeadline,
      capacity: 20,
      isOpenForEnrollment: true,
      leadTeacherProfileId: leadTeacher?.id ?? null,
    },
    create: {
      courseId: liveCourse.id,
      termId: null,
      name: 'Multiplication & Fractions — Spring Batch',
      code: 'G34-MATH-LIVE-1',
      description: 'Small-group live maths, twice a week after school.',
      capacity: 20,
      isOpenForEnrollment: true,
      // The weekly pattern the Schedule page generates sessions from.
      meetingDays: ['TUESDAY', 'THURSDAY'],
      meetingStartMinutes: 16 * 60,
      meetingDurationMinutes: 60,
      startDate: batchStart,
      endDate: batchEnd,
      enrollmentDeadline: batchDeadline,
      leadTeacherProfileId: leadTeacher?.id ?? null,
    },
  });

  // "One course, many teachers" — a join table, which is all it ever needed.
  const allTeachers = await prisma.teacherProfile.findMany({
    where: { deletedAt: null },
    take: 2,
    select: { id: true },
  });
  for (const [index, t] of allTeachers.entries()) {
    await prisma.courseTeacher.upsert({
      where: {
        courseId_teacherProfileId: {
          courseId: liveCourse.id,
          teacherProfileId: t.id,
        },
      },
      update: {},
      create: {
        courseId: liveCourse.id,
        teacherProfileId: t.id,
        role: index === 0 ? 'LEAD' : 'ASSISTANT',
      },
    });
  }
  console.log(`✅ Seeded a live batch and ${allTeachers.length} course teachers`);

  // ─── Live class demo chain ──────────────────────────────────────────────────
  // A LIVE_CLASS item is curriculum; the meeting that fulfils it belongs to a
  // batch; and a student only reaches it through StudentCourseEnrollment. All
  // three links have to exist or the feature demos as an empty panel.

  // The term batches at the top of this file are created before any course
  // exists, so they cannot be welded there.
  for (const link of [
    { code: 'G12-MATH-2026', courseId: g12MathCourse.id },
    { code: 'G34-MATH-2026', courseId: g34MathCourse.id },
    { code: 'G12-READ-2026', courseId: g12LaCourse.id },
  ]) {
    await prisma.batch.update({
      where: { code: link.code },
      data: { courseId: link.courseId },
    });
  }

  // The live cohort needs seats filled, otherwise every batch-scoped view
  // (teacher portal, gradebook, the learner's own session) renders empty.
  const liveBatch = await prisma.batch.findUnique({
    where: { code: 'G34-MATH-LIVE-1' },
    select: { id: true, endDate: true },
  });

  if (liveBatch) {
    const cohort = await prisma.studentProfile.findMany({
      where: { deletedAt: null },
      take: 4,
      orderBy: { fullName: 'asc' },
      select: { id: true },
    });

    for (const student of cohort) {
      await prisma.studentCourseEnrollment.upsert({
        where: {
          studentProfileId_batchId: {
            studentProfileId: student.id,
            batchId: liveBatch.id,
          },
        },
        update: {},
        create: {
          studentProfileId: student.id,
          batchId: liveBatch.id,
          status: 'ENROLLED',
        },
      });

      // A live purchase grants both a seat and an entitlement, and the
      // entitlement expires with the batch — mirror that, or the cohort can
      // see the session but not open the course around it.
      const held = await prisma.entitlement.findFirst({
        where: { studentProfileId: student.id, courseId: liveCourse.id },
        select: { id: true },
      });
      if (!held) {
        await prisma.entitlement.create({
          data: {
            studentProfileId: student.id,
            courseId: liveCourse.id,
            source: 'ADMIN_GRANT',
            status: 'ACTIVE',
            accessExpiresAt: liveBatch.endDate,
          },
        });
      }
    }

    // Restricted to a CHAPTER: the last concept in a course is a CHECKPOINT,
    // a gated assessment, which is no place for a scheduled meeting.
    const liveConcept = await prisma.concept.findFirst({
      where: { courseId: liveCourse.id, kind: 'CHAPTER' },
      orderBy: { sortOrder: 'desc' },
      select: { id: true },
    });

    if (liveConcept) {
      const liveItem =
        (await prisma.moduleItem.findFirst({
          where: { conceptId: liveConcept.id, kind: 'LIVE_CLASS' },
          select: { id: true },
        })) ??
        (await prisma.moduleItem.create({
          data: {
            conceptId: liveConcept.id,
            kind: 'LIVE_CLASS',
            title: 'Live Session: Fractions Together',
            sortOrder: 99,
            status: 'PUBLISHED',
          },
          select: { id: true },
        }));

      // A course carrying a live item is LIVE-only.
      await prisma.course.update({
        where: { id: liveCourse.id },
        data: { deliveryMode: 'LIVE' },
      });

      const sessionDay = new Date(batchStart);
      sessionDay.setDate(sessionDay.getDate() + 7);
      const sessionDate = new Date(
        Date.UTC(
          sessionDay.getUTCFullYear(),
          sessionDay.getUTCMonth(),
          sessionDay.getUTCDate(),
        ),
      );
      const sessionStart = new Date(sessionDate);
      sessionStart.setUTCHours(16, 0, 0, 0);
      const sessionEnd = new Date(sessionDate);
      sessionEnd.setUTCHours(17, 0, 0, 0);

      const existingSession = await prisma.batchSession.findFirst({
        where: { batchId: liveBatch.id, moduleItemId: liveItem.id },
        select: { id: true },
      });
      if (!existingSession) {
        await prisma.batchSession.create({
          data: {
            batchId: liveBatch.id,
            moduleItemId: liveItem.id,
            topic: 'Live Session: Fractions Together',
            date: sessionDate,
            startTime: sessionStart,
            endTime: sessionEnd,
            teacherUserId: null,
            status: 'SCHEDULED',
          },
        });
      }
    }

    console.log(
      `✅ Live chain: ${cohort.length} seats in G34-MATH-LIVE-1, entitlements, and a scheduled session`,
    );
  }


  // ─── Free previews ──────────────────────────────────────────────────────────
  // The first item of each course is given away. A course page with nothing
  // playable converts badly and gives search engines nothing to index.
  // Scans every concept in the course, not just the first: module items are
  // concentrated in the later "... in Practice" concepts, so looking only at
  // concept #1 would silently mark nothing.
  const coursesWithConcepts = await prisma.course.findMany({
    where: { deletedAt: null, concepts: { some: {} } },
    select: {
      id: true,
      concepts: { orderBy: { sortOrder: 'asc' }, select: { id: true } },
    },
  });

  let previewCount = 0;
  for (const course of coursesWithConcepts) {
    const firstItem = await prisma.moduleItem.findFirst({
      where: {
        conceptId: { in: course.concepts.map((c) => c.id) },
        deletedAt: null,
      },
      orderBy: [{ concept: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      select: { id: true },
    });
    if (firstItem) {
      await prisma.moduleItem.update({
        where: { id: firstItem.id },
        data: { isFreePreview: true },
      });
      previewCount += 1;
    }
  }
  console.log(`✅ Marked ${previewCount} free-preview items`);

  // ─── Entitlements ───────────────────────────────────────────────────────────
  // Content is entitlement-gated from Phase 1 onward, so the demo needs at
  // least one entitled student. Charlotte (the fully-unlocked test account)
  // gets granted access; the other seeded students are deliberately left
  // WITHOUT entitlements so the locked state is demoable too.
  if (charlotteProfile) {
    for (const p of [program, g12Bundle]) {
      const existing = await prisma.entitlement.findFirst({
        where: { studentProfileId: charlotteProfile.id, programId: p.id },
        select: { id: true },
      });
      if (!existing) {
        await prisma.entitlement.create({
          data: {
            studentProfileId: charlotteProfile.id,
            programId: p.id,
            source: 'ADMIN_GRANT',
            status: 'ACTIVE',
            // Null expiry = permanent, matching a fully-paid self-paced purchase.
            accessExpiresAt: null,
            note: 'Seeded demo entitlement',
          },
        });
      }
    }
    console.log('✅ Seeded entitlements for Charlotte');
  }

  // ─── Homework checkpoint (course-attached) ──────────────────────────────────
  //
  // The cohort homework above hangs off a batch, which a self-paced learner
  // never has. This is the other shape: a HOMEWORK item inside a chapter, with
  // the brief on the Homework row and no batch at all.
  //
  // Seeded with one submission still waiting to be marked and one already
  // marked, because the three screens that read this — the course player, the
  // teacher's review list, and the course progress grid — each render a
  // different one of those states, and with an empty table they all show the
  // same empty box.
  const checkpointCourse = await prisma.course.findFirst({
    where: { title: 'Multiplication, Division & Fractions' },
    select: { id: true },
  });
  if (checkpointCourse) {
    // The FIRST chapter, not the last. Chapters unlock in sequence, so a
    // checkpoint in the final one is disabled in the player for any learner
    // who has not worked through everything before it — which is every seeded
    // learner, making the seed useless for exercising the flow.
    const checkpointChapter = await prisma.concept.findFirst({
      where: { courseId: checkpointCourse.id },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });

    if (checkpointChapter) {
      let hwItem = await prisma.moduleItem.findFirst({
        where: { conceptId: checkpointChapter.id, kind: 'HOMEWORK' },
        include: { homework: true },
      });

      if (!hwItem) {
        hwItem = await prisma.moduleItem.create({
          data: {
            conceptId: checkpointChapter.id,
            kind: 'HOMEWORK',
            title: 'Show your working: sharing 24 sweets',
            sortOrder: 99,
            status: 'PUBLISHED',
            homework: {
              create: {
                title: 'Show your working: sharing 24 sweets',
                description:
                  'Share 24 sweets equally between 4 friends, then between 6. ' +
                  'Draw or photograph your working and upload it. Write one ' +
                  'sentence saying what you noticed about the two answers.',
                maxPoints: 20,
                // No dueDate on purpose: this is the self-paced shape.
              },
            },
          },
          include: { homework: true },
        });
      }

      // Two learners already entitled to this course, in different states.
      const entitled = await prisma.entitlement.findMany({
        where: { courseId: checkpointCourse.id, status: 'ACTIVE' },
        select: { studentProfile: { select: { id: true, fullName: true } } },
      });
      // By name, so a reseed always produces the same two learners rather than
      // whichever id happened to sort first.
      entitled.sort((a, b) =>
        a.studentProfile.fullName.localeCompare(b.studentProfile.fullName),
      );

      if (hwItem.homework && entitled.length >= 2) {
        const [waiting, marked] = entitled;

        await prisma.homeworkSubmission.upsert({
          where: {
            homeworkId_studentProfileId: {
              homeworkId: hwItem.homework.id,
              studentProfileId: waiting.studentProfile.id,
            },
          },
          update: {},
          create: {
            homeworkId: hwItem.homework.id,
            studentProfileId: waiting.studentProfile.id,
            content: 'I shared them out and got 6 each, then 4 each.',
            status: 'SUBMITTED',
          },
        });

        await prisma.homeworkSubmission.upsert({
          where: {
            homeworkId_studentProfileId: {
              homeworkId: hwItem.homework.id,
              studentProfileId: marked.studentProfile.id,
            },
          },
          update: {},
          create: {
            homeworkId: hwItem.homework.id,
            studentProfileId: marked.studentProfile.id,
            content: 'More friends means fewer sweets each.',
            status: 'GRADED',
            pointsEarned: 18,
            feedback: 'Exactly right, and a clear sentence. Show the division next time.',
            gradedAt: new Date(),
          },
        });

        console.log(
          `✅ Seeded a homework checkpoint (1 to mark, 1 marked, ${entitled.length} entitled)`,
        );
      }
    }
  }

  // ─── Interactive story ────────────────────────────────────────────────────
  // One real story, so the content model is exercised by something an author
  // would actually write rather than by fixtures. No narration audio and no
  // voice agent yet — a story is meant to be fully readable without either,
  // and this is the check on that claim.
  console.log('🌱 Seeding an interactive story...');

  const storyChapterConcept = await prisma.concept.upsert({
    where: { name: 'Story Time' },
    update: { courseId: alphabetCourse.id, sortOrder: 4, kind: 'CHAPTER' },
    create: {
      name: 'Story Time',
      description: 'A story to listen to, with pictures.',
      courseId: alphabetCourse.id,
      sortOrder: 4,
      kind: 'CHAPTER',
    },
  });

  let storyItem = await prisma.moduleItem.findFirst({
    where: { conceptId: storyChapterConcept.id, kind: 'STORY' },
  });
  if (!storyItem) {
    storyItem = await prisma.moduleItem.create({
      data: {
        conceptId: storyChapterConcept.id,
        kind: 'STORY',
        title: 'Bramble and the Too-Big Puddle',
        sortOrder: 1,
        status: 'PUBLISHED',
        // Deliberately given away: a story is the best possible advert for
        // this product, and it costs nothing extra to let a visitor hear one.
        isFreePreview: true,
      },
    });
  }

  const existingStory = await prisma.story.findUnique({
    where: { moduleItemId: storyItem.id },
  });
  if (!existingStory) {
    const story = await prisma.story.create({
      data: {
        moduleItemId: storyItem.id,
        title: 'Bramble and the Too-Big Puddle',
        synopsis:
          'Bramble the hedgehog meets a puddle far too wide to jump, and has to think of another way across.',
        gradeBand: 'PRE_K_K',
        // Written for the voice agent that does not exist yet. Capturing the
        // author's intent while the story is being written is much easier than
        // reconstructing it later.
        agentGuidance:
          'This story is about trying a different approach when the first one does not work. ' +
          'Answer only from what happens in the story and who is in it. If a child asks about ' +
          'something the story does not cover, say so warmly and offer to keep reading. Never ' +
          'invent extra events, characters or endings.',
      },
    });

    await prisma.storyCharacter.createMany({
      data: [
        {
          storyId: story.id,
          name: 'Bramble',
          description: 'A small hedgehog who is braver than she thinks.',
          sortOrder: 1,
        },
        {
          storyId: story.id,
          name: 'Pip',
          description: 'A wren who watches from the hedge and asks good questions.',
          sortOrder: 2,
        },
      ],
    });

    const chapters: { title: string; segments: string[] }[] = [
      {
        title: 'The Puddle',
        segments: [
          'Bramble the hedgehog set off down the lane one wet morning, humming a small hum.',
          'She had not gone far when she stopped. Right across the path lay a puddle. It was a very wide puddle.',
          '"I shall jump it," said Bramble. She backed up. She ran. She jumped — and landed with a splash, right in the middle.',
        ],
      },
      {
        title: 'Pip Has an Idea',
        segments: [
          'From the hedge came a small voice. "That did not work," said Pip the wren, tilting her head.',
          '"I noticed," said Bramble, dripping.',
          '"You tried going over," said Pip. "What else is there?"',
          'Bramble sat and thought. Over had not worked. Through had not worked either, really. That left one thing.',
        ],
      },
      {
        title: 'Around',
        segments: [
          'Bramble walked to the edge of the puddle, and then along it, and then around it.',
          'It took a little longer. She did not mind.',
          '"You went around," said Pip, flying alongside. "That was clever."',
          '"It was not clever," said Bramble. "It was just the next thing I tried." And she carried on down the lane, still damp, still humming.',
        ],
      },
    ];

    for (const [ci, chapter] of chapters.entries()) {
      const chapterRow = await prisma.storyChapter.create({
        data: { storyId: story.id, title: chapter.title, sortOrder: ci + 1 },
      });
      for (const [si, text] of chapter.segments.entries()) {
        await prisma.storySegment.create({
          data: { chapterId: chapterRow.id, text, sortOrder: si + 1 },
        });
      }
    }

    const segmentCount = chapters.reduce((n, c) => n + c.segments.length, 0);
    console.log(
      `✅ Seeded 1 story — ${chapters.length} chapters, ${segmentCount} segments, 2 characters (no audio yet)`,
    );
  } else {
    console.log('✅ Story already present');
  }

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
