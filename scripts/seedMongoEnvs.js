require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { setBulkEnvInMongo, getMongoClient } = require('../utils/mongoEnvLoader');

async function seedMongoEnvironments() {
  console.log('==================================================');
  console.log('🚀 Seeding Environment Variables to MongoDB Atlas');
  console.log('==================================================\n');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in process.env or .env file!');
    console.error('Please configure MONGODB_URI in your .env file before running seed.');
    process.exit(1);
  }

  const environments = ['dev', 'uat', 'demo'];

  for (const envName of environments) {
    const envFilePath = path.resolve(__dirname, '..', `.env.${envName}`);
    if (fs.existsSync(envFilePath)) {
      const fileContent = fs.readFileSync(envFilePath, 'utf8');
      const parsedVars = dotenv.parse(fileContent);
      console.log(`Uploading ${Object.keys(parsedVars).length} variables from .env.${envName} to MongoDB Atlas...`);
      await setBulkEnvInMongo(envName, parsedVars);
      console.log(`✅ Uploaded '${envName}' environment successfully.`);
    } else {
      console.warn(`⚠️ Warning: .env.${envName} file not found on disk. Skipped.`);
    }
  }

  const client = await getMongoClient();
  if (client) {
    await client.close();
  }

  console.log('\n==================================================');
  console.log('🎉 MongoDB Atlas Environment Seeding Complete!');
  console.log('==================================================\n');
}

seedMongoEnvironments().catch(err => {
  console.error('❌ Error seeding MongoDB environments:', err);
  process.exit(1);
});
