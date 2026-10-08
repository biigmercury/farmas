import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_FARMER_EMAIL = "don@donsfarm.ng";
const DEMO_ADMIN_EMAIL = "admin@farmas.africa";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY_MS);

async function main(): Promise<void> {
  console.log("Seeding FARMAS demo data...");

  // Only remove the demo accounts this script creates (their farms and records go with them, via cascade).
  // It must NEVER wipe the whole database: on a shared database that would delete real farmers' data.
  await prisma.user.deleteMany({ where: { email: { in: [DEMO_FARMER_EMAIL, DEMO_ADMIN_EMAIL] } } });

  const farmerPasswordHash = await bcrypt.hash("password123", 10);

  const farmer = await prisma.user.create({
    data: {
      name: "Don Emeka",
      email: DEMO_FARMER_EMAIL,
      phone: "2348031234567",
      passwordHash: farmerPasswordHash,
      role: "FARMER",
    },
  });

  // An admin can read EVERY farm, so it is only created when you set a password yourself:
  //   SEED_ADMIN_PASSWORD=<something long and private> npm run db:seed
  // No admin password is stored in the repo.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminPassword && adminPassword.length >= 12) {
    await prisma.user.create({
      data: {
        name: "FarmAs Admin",
        email: DEMO_ADMIN_EMAIL,
        phone: "2348000000001",
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
      },
    });
    console.log("Admin account created (password from SEED_ADMIN_PASSWORD).");
  } else {
    console.log("No admin account created (set SEED_ADMIN_PASSWORD, 12+ characters, to create one).");
  }

  const farm = await prisma.farm.create({
    data: {
      ownerId: farmer.id,
      name: "Dons Farm, Nigeria",
      location: "Kaduna State, Nigeria",
      farmType: "Poultry & Livestock",
      size: "4.5 hectares",
    },
  });

  await prisma.livestock.createMany({
    data: [
      { farmId: farm.id, type: "POULTRY", breed: "Cobb 500", quantity: 500, age: "6 weeks" },
      { farmId: farm.id, type: "GOAT", breed: "Sahel", quantity: 30, age: "2 years", gender: "FEMALE" },
      { farmId: farm.id, type: "SHEEP", breed: "Uda", quantity: 15, age: "1.5 years" },
    ],
  });

  const broilerBatch = await prisma.batch.create({
    data: {
      farmId: farm.id,
      livestockType: "POULTRY",
      name: "Broilers Batch A",
      quantity: 500,
      purchaseDate: daysAgo(42),
      purchaseCost: 1150000,
      status: "ACTIVE",
    },
  });

  const goatBatch = await prisma.batch.create({
    data: {
      farmId: farm.id,
      livestockType: "GOAT",
      name: "Goat Batch 1",
      quantity: 30,
      purchaseDate: daysAgo(120),
      purchaseCost: 450000,
      status: "ACTIVE",
    },
  });

  const sheepBatch = await prisma.batch.create({
    data: {
      farmId: farm.id,
      livestockType: "SHEEP",
      name: "Sheep Batch 1",
      quantity: 15,
      purchaseDate: daysAgo(90),
      purchaseCost: 225000,
      status: "ACTIVE",
    },
  });

  await prisma.expense.createMany({
    data: [
      {
        farmId: farm.id,
        batchId: broilerBatch.id,
        category: "FEED",
        amount: 185000,
        description: "Starter feed - 40 bags",
        date: daysAgo(30),
      },
      {
        farmId: farm.id,
        batchId: broilerBatch.id,
        category: "FEED",
        amount: 160000,
        description: "Grower feed - 35 bags",
        date: daysAgo(10),
      },
      {
        farmId: farm.id,
        batchId: broilerBatch.id,
        category: "MEDICATION",
        amount: 45000,
        description: "Vitamins and antibiotics",
        date: daysAgo(18),
      },
      {
        farmId: farm.id,
        category: "LABOUR",
        amount: 60000,
        description: "Casual workers payment",
        date: daysAgo(5),
      },
      {
        farmId: farm.id,
        category: "UTILITIES",
        amount: 25000,
        description: "Generator fuel and electricity",
        date: daysAgo(3),
      },
    ],
  });

  await prisma.sale.createMany({
    data: [
      {
        farmId: farm.id,
        batchId: broilerBatch.id,
        livestockType: "POULTRY",
        quantity: 50,
        amount: 375000,
        buyer: "Mallam Sani",
        date: daysAgo(7),
      },
      {
        farmId: farm.id,
        batchId: broilerBatch.id,
        livestockType: "POULTRY",
        quantity: 25,
        amount: 195000,
        buyer: "Chidi Ventures",
        date: daysAgo(2),
      },
      {
        farmId: farm.id,
        batchId: goatBatch.id,
        livestockType: "GOAT",
        quantity: 5,
        amount: 125000,
        buyer: "Oke Ayo Market",
        date: daysAgo(20),
      },
    ],
  });

  await prisma.feedRecord.createMany({
    data: [
      { farmId: farm.id, batchId: broilerBatch.id, feedType: "Starter feed", quantity: 8, cost: 68000, date: daysAgo(9) },
      { farmId: farm.id, batchId: broilerBatch.id, feedType: "Starter feed", quantity: 9, cost: 76500, date: daysAgo(7) },
      { farmId: farm.id, batchId: broilerBatch.id, feedType: "Starter feed", quantity: 8, cost: 68000, date: daysAgo(6) },
      { farmId: farm.id, batchId: broilerBatch.id, feedType: "Grower feed", quantity: 10, cost: 85000, date: daysAgo(4) },
      { farmId: farm.id, batchId: broilerBatch.id, feedType: "Grower feed", quantity: 9, cost: 76500, date: daysAgo(3) },
      { farmId: farm.id, batchId: broilerBatch.id, feedType: "Grower feed", quantity: 10, cost: 85000, date: daysAgo(2) },
      { farmId: farm.id, batchId: broilerBatch.id, feedType: "Finisher feed", quantity: 12, cost: 102000, date: daysAgo(1) },
    ],
  });

  await prisma.healthRecord.create({
    data: {
      farmId: farm.id,
      batchId: broilerBatch.id,
      symptoms: "Some birds dey cough and no dey dey eat well since two days",
      observations: "Reduced feed intake, mild respiratory sound in a few birds",
      numberAffected: 45,
      mortality: 3,
      riskLevel: "MEDIUM",
      aiAssessment: JSON.stringify(
        {
          risk_level: "MEDIUM",
          observations: ["Reduced feed intake", "Mild respiratory signs"],
          possible_concerns: ["Early respiratory infection"],
          recommended_actions: ["Isolate affected birds", "Improve ventilation", "Review medication schedule"],
          requires_vet_escalation: false,
          disclaimer:
            "FarmAs provides AI-assisted decision support and does not replace professional veterinary diagnosis.",
          seeded: true,
        },
        null,
        2
      ),
      createdAt: daysAgo(4),
    },
  });

  await prisma.healthRecord.create({
    data: {
      farmId: farm.id,
      batchId: broilerBatch.id,
      symptoms: "18 broilers don kpai since morning, others dey dull and droopy",
      observations: "Sudden mortality cluster, dull birds with ruffled feathers",
      numberAffected: 60,
      mortality: 18,
      riskLevel: "HIGH",
      aiAssessment: JSON.stringify(
        {
          risk_level: "HIGH",
          observations: ["Sudden mortality cluster", "Dull birds with ruffled feathers"],
          possible_concerns: ["Newcastle disease", "Acute bacterial infection"],
          recommended_actions: [
            "Contact your veterinarian immediately",
            "Isolate affected birds",
            "Disinfect pens and review biosecurity",
          ],
          requires_vet_escalation: true,
          disclaimer:
            "FarmAs provides AI-assisted decision support and does not replace professional veterinary diagnosis.",
          seeded: true,
        },
        null,
        2
      ),
      createdAt: daysAgo(1),
    },
  });

  // The deaths above, in the inventory log (this is what the dashboard's mortality card counts).
  await prisma.livestockMovement.createMany({
    data: [
      { farmId: farm.id, livestockType: "POULTRY", change: -3, reason: "DEATH", note: "Coughing, off feed", createdAt: daysAgo(4) },
      { farmId: farm.id, livestockType: "POULTRY", change: -18, reason: "DEATH", note: "Sudden mortality cluster", createdAt: daysAgo(1) },
    ],
  });

  await prisma.vaccination.createMany({
    data: [
      {
        farmId: farm.id,
        batchId: broilerBatch.id,
        vaccine: "Newcastle Disease Vaccine (La Sota)",
        date: daysAhead(3),
        status: "PENDING",
        notes: "Booster dose for Broilers Batch A",
      },
      {
        farmId: farm.id,
        batchId: broilerBatch.id,
        vaccine: "Gumboro (IBD)",
        date: daysAgo(20),
        status: "COMPLETED",
        notes: "First dose completed",
      },
      {
        farmId: farm.id,
        batchId: goatBatch.id,
        vaccine: "Goat Deworming",
        date: daysAhead(7),
        status: "PENDING",
        notes: "Quarterly deworming for goat pen",
      },
    ],
  });

  await prisma.task.createMany({
    data: [
      {
        farmId: farm.id,
        title: "Administer Newcastle booster",
        description: "La Sota booster for Broilers Batch A",
        dueDate: daysAhead(3),
        category: "VACCINATION",
        status: "PENDING",
      },
      {
        farmId: farm.id,
        title: "Clean broiler pens",
        description: "Deep clean and disinfect",
        dueDate: daysAhead(1),
        category: "CLEANING",
        status: "PENDING",
      },
      {
        farmId: farm.id,
        title: "Vet visit - investigate mortality",
        description: "Dr. Bello to review recent mortality in broilers",
        dueDate: daysAhead(2),
        category: "VET_VISIT",
        status: "PENDING",
      },
      {
        farmId: farm.id,
        title: "Restock feed",
        description: "Order 20 bags of finisher feed",
        dueDate: daysAhead(4),
        category: "FEEDING",
        status: "PENDING",
      },
      {
        farmId: farm.id,
        title: "Morning feeding",
        dueDate: daysAgo(1),
        category: "FEEDING",
        status: "DONE",
      },
    ],
  });

  await prisma.alert.createMany({
    data: [
      {
        farmId: farm.id,
        type: "MORTALITY",
        severity: "WARNING",
        title: "High mortality in Broilers Batch A",
        description:
          "21 mortalities recorded recently (4.2% of 500). Threshold na 3%. Abeg call your vet.",
        status: "ACTIVE",
        createdAt: daysAgo(1),
      },
      {
        farmId: farm.id,
        type: "FEED_DROP",
        severity: "LOW_RISK",
        title: "Feed consumption normalised",
        description: "Feed usage back to normal after last week's drop.",
        status: "RESOLVED",
        createdAt: daysAgo(12),
      },
    ],
  });

  await prisma.aiConversation.create({
    data: {
      userId: farmer.id,
      farmId: farm.id,
      channel: "APP",
      message: "How much I spend this month?",
      response:
        "For October 2026, you don spend ₦510,000 total across 4 expenses. Breakdown — FEED: ₦160,000 (1), LABOUR: ₦60,000 (1), UTILITIES: ₦25,000 (1), MEDICATION: ₦45,000 (1).",
      createdAt: daysAgo(2),
    },
  });

  console.log("");
  console.log("Seed complete.");
  console.log("--------------------------------------------------");
  console.log("Demo farmer login");
  console.log("  email:    don@donsfarm.ng");
  console.log("  phone:    2348031234567");
  console.log("  password: password123");
  console.log(`Farm: ${farm.name} (${farm.id})`);
  console.log("--------------------------------------------------");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
