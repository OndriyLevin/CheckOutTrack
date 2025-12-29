const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const id = process.argv[2];

if (!id) {
    console.log('Please provide a Telegram ID as an argument.');
    process.exit(1);
}

async function main() {
    try {
        const user = await prisma.user.update({
            where: { telegramId: BigInt(id) },
            data: { isAdmin: true },
        });
        console.log(`User ${user.username || user.firstName} (ID: ${id}) is now an Admin!`);
    } catch (e) {
        console.error('Error:', e.message);
        console.log('Ensure the user exists in the database first (log in via Web App).');
    } finally {
        await prisma.$disconnect();
    }
}

main();
