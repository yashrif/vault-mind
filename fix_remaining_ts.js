const fs = require('fs');
const { execSync } = require('child_process');

function fixFiles() {
  const brevilabsPath = 'src/LLMProviders/brevilabsClient.ts';
  if (fs.existsSync(brevilabsPath)) {
     let content = fs.readFileSync(brevilabsPath, 'utf8');
     content = content.replace(/import \{ \w+ \} from "@\/error";\n?/g, '');
     content = content.replace(/const BREVILABS_API_BASE_URL = "https:\/\/api\.brevilabs\.com\/v1";/g, 'const BREVILABS_API_BASE_URL = "https://api.brevilabs.com/v1";\n// Phase 2 refactor placeholder');
     fs.writeFileSync(brevilabsPath, content);
  }

  // Restore the missing constants temporarily to fix build errors in UI
  const constantsPath = 'src/constants.ts';
  if (fs.existsSync(constantsPath)) {
      let content = fs.readFileSync(constantsPath, 'utf8');
      if (!content.includes('PLUS_UTM_MEDIUMS')) {
         content += `\nexport const PLUS_UTM_MEDIUMS = { SETTINGS: "settings" };`;
      }
      fs.writeFileSync(constantsPath, content);
  }
}
fixFiles();
console.log('Fixes applied');
