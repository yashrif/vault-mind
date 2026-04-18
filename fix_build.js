const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    for (const [search, replace] of replacements) {
        content = content.replace(search, replace);
    }
    fs.writeFileSync(filePath, content);
}

// 1. LLMProviders/brevilabsClient.ts
replaceInFile('src/LLMProviders/brevilabsClient.ts', [
    [/import \{ BREVILABS_API_BASE_URL \} from "@\/constants";/g, 'const BREVILABS_API_BASE_URL = "https://api.brevilabs.com/v1";'],
    [/import \{(.*?)(MissingPlusLicenseError)(.*?)\} from "@\/error";/g, 'import {$1$3} from "@/error";'],
    [/throw new MissingPlusLicenseError/g, 'throw new Error']
]);

// 2. src/plusUtils.ts
replaceInFile('src/plusUtils.ts', [
    [/import \{.*?PlusUtmMedium.*?\} from "@\/constants";/g, 'type PlusUtmMedium = string;'],
    [/import \{.*?COPILOT_PLUS.*?\} from "@\/constants";/g, ''],
    [/export const isPlusModel =[\s\S]*?};/g, 'export const isPlusModel = (model: any) => false;']
]);

// 3. src/utils/modelUtils.ts
replaceInFile('src/utils/modelUtils.ts', [
    [/import \{.*?COPILOT_PLUS.*?\} from "@\/constants";/g, ''],
    [/export const isPlusModel =[\s\S]*?};/g, 'export const isPlusModel = (model: any) => false;']
]);

// 4. src/settings/model.ts
replaceInFile('src/settings/model.ts', [
    [/believerExclusive\?: boolean;/g, '']
]);

// 5. src/settings/providerModels.ts
replaceInFile('src/settings/providerModels.ts', [
    [/\[ChatModelProviders\.COPILOT_PLUS\]: \[[\s\S]*?\],/g, '']
]);

// 6. src/settings/v2/components/BasicSettings.tsx
replaceInFile('src/settings/v2/components/BasicSettings.tsx', [
    [/import \{.*?PLUS_UTM_MEDIUMS.*?\} from "@\/constants";/g, ''],
    [/<PlusSettings[\s\S]*?\/>/g, '']
]);

// 7. src/components/chat-components/ChatControls.tsx
replaceInFile('src/components/chat-components/ChatControls.tsx', [
    [/import \{.*?PLUS_UTM_MEDIUMS.*?\} from "@\/constants";/g, ''],
    [/navigateToPlusPage[\s\S]*?\)/g, '']
]);

// 8. src/settings/v2/components/PlusSettings.tsx
replaceInFile('src/settings/v2/components/PlusSettings.tsx', [
    [/import \{.*?PLUS_UTM_MEDIUMS.*?\} from "@\/constants";/g, '']
]);

// 9. src/utils.ts
replaceInFile('src/utils.ts', [
    [/model\.believerExclusive/g, 'false'],
    [/model\.provider === EmbeddingModelProviders\.COPILOT_PLUS \|\|/g, ''],
    [/model\.provider === EmbeddingModelProviders\.COPILOT_PLUS_JINA/g, 'false']
]);

// 10. src/settings/v2/components/ModelEditDialog.tsx
replaceInFile('src/settings/v2/components/ModelEditDialog.tsx', [
    [/customModel\.provider === EmbeddingModelProviders\.COPILOT_PLUS_JINA/g, 'false']
]);

// 11. src/settings/v2/components/ModelAddDialog.tsx
replaceInFile('src/settings/v2/components/ModelAddDialog.tsx', [
    [/EmbeddingModelProviders\.COPILOT_PLUS,/g, ''],
    [/EmbeddingModelProviders\.COPILOT_PLUS_JINA,/g, ''],
    [/ChatModelProviders\.COPILOT_PLUS,/g, ''],
    [/provider === ChatModelProviders\.COPILOT_PLUS/g, 'false'],
    [/provider === EmbeddingModelProviders\.COPILOT_PLUS_JINA/g, 'false']
]);

// 12. src/settings/v2/components/ModelSettings.tsx
replaceInFile('src/settings/v2/components/ModelSettings.tsx', [
    [/plusExclusive/g, 'missingProp1'],
    [/believerExclusive/g, 'missingProp2']
]);

console.log("Fixes applied");
