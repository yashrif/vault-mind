const fs = require('fs');

// 1. Fix src/LLMProviders/chatModelManager.ts
let chatModelManager = fs.readFileSync('src/LLMProviders/chatModelManager.ts', 'utf8');
chatModelManager = chatModelManager.replace(/&& !model\.believerExclusive/g, '');
fs.writeFileSync('src/LLMProviders/chatModelManager.ts', chatModelManager);

// 2. Fix src/LLMProviders/embeddingManager.ts
let embeddingManager = fs.readFileSync('src/LLMProviders/embeddingManager.ts', 'utf8');
// remove plusExclusive / believerExclusive blocks
embeddingManager = embeddingManager.replace(/\s*\/\/ Check if model is plus-exclusive[\s\S]*?(?=\/\/ Check if model is believer-exclusive|\n\s*const selectedModel)/, '');
embeddingManager = embeddingManager.replace(/\s*\/\/ Check if model is believer-exclusive[\s\S]*?(?=\n\s*const selectedModel)/, '');
fs.writeFileSync('src/LLMProviders/embeddingManager.ts', embeddingManager);

// 3. Delete those dead modal files
try { fs.unlinkSync('src/components/modals/CopilotPlusExpiredModal.tsx'); } catch(e){}
try { fs.unlinkSync('src/components/modals/CopilotPlusWelcomeModal.tsx'); } catch(e){}

// 4. Update plusUtils.ts - just empty it out since it's breaking or remove lines (wait we'll just remove the whole file later if possible or dummy it out)
try { fs.unlinkSync('src/plusUtils.ts'); } catch(e){}

// 5. Fix src/settings/model.ts
let settingsModel = fs.readFileSync('src/settings/model.ts', 'utf8');
settingsModel = settingsModel.replace(/believerExclusive:.*?,/g, '');
fs.writeFileSync('src/settings/model.ts', settingsModel);

// 6. Fix src/settings/providerModels.ts
let providerModels = fs.readFileSync('src/settings/providerModels.ts', 'utf8');
providerModels = providerModels.replace(/\[ChatModelProviders\.COPILOT_PLUS\]: \[\],?/g, '');
fs.writeFileSync('src/settings/providerModels.ts', providerModels);

// 7. Fix src/settings/v2/components/ModelAddDialog.tsx
let modelAddDialog = fs.readFileSync('src/settings/v2/components/ModelAddDialog.tsx', 'utf8');
modelAddDialog = modelAddDialog.replace(/provider \=\=\= "COPILOT_PLUS" \|\| /g, '');
modelAddDialog = modelAddDialog.replace(/provider \=\=\= "COPILOT_PLUS_JINA" \|\| /g, '');
modelAddDialog = modelAddDialog.replace(/provider \=\=\= "COPILOT_PLUS"/g, 'false');
// there is an issue with mapping models if value missing, let's fix the provider condition
fs.writeFileSync('src/settings/v2/components/ModelAddDialog.tsx', modelAddDialog);

// 8. Fix src/settings/v2/components/ModelEditDialog.tsx
let modelEditDialog = fs.readFileSync('src/settings/v2/components/ModelEditDialog.tsx', 'utf8');
modelEditDialog = modelEditDialog.replace(/ &&\n\s*provider \!\=\= EmbeddingModelProviders\.COPILOT_PLUS_JINA/g, '');
fs.writeFileSync('src/settings/v2/components/ModelEditDialog.tsx', modelEditDialog);

// 9. Fix src/utils.ts
let utils = fs.readFileSync('src/utils.ts', 'utf8');
utils = utils.replace(/model\.believerExclusive \|\| /g, '');
utils = utils.replace(/provider \=\=\= EmbeddingModelProviders\.COPILOT_PLUS \|\|\n\s*provider \=\=\= EmbeddingModelProviders\.COPILOT_PLUS_JINA\n\s*\?\s*"Copilot Plus"\s*\:/g, '');
fs.writeFileSync('src/utils.ts', utils);

// 10. Fix src/utils/modelUtils.ts
let modelUtils = fs.readFileSync('src/utils/modelUtils.ts', 'utf8');
modelUtils = modelUtils.replace(/if \(.*COPILOT_PLUS.*\) \{[\s\S]*?\}/, '');
fs.writeFileSync('src/utils/modelUtils.ts', modelUtils);

