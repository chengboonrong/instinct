// Copy the built harness without redistributing the 1.23 GiB model weights.
// Build with VITE_MODEL_BASE_URL pointing to an immutable, CORS-enabled source.
import fs from 'node:fs';
import path from 'node:path';
const destination=process.argv[2];
if(!destination||!path.isAbsolute(destination))throw new Error('Provide an absolute empty deployment directory');
if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw new Error('Deployment directory must be empty');
fs.mkdirSync(destination,{recursive:true});
for(const name of ['index.html','assets','wasm'])fs.cpSync(path.join('dist',name),path.join(destination,name),{recursive:true});
const models=path.join(destination,'models/laya');fs.mkdirSync(models,{recursive:true});
for(const name of ['manifest.json','source.json'])fs.copyFileSync(path.join('public/models/laya',name),path.join(models,name));
fs.copyFileSync('vendor/laya/LICENSE',path.join(destination,'LAYA-LICENSE.txt'));
fs.copyFileSync('node_modules/three/LICENSE',path.join(destination,'THREE-LICENSE.txt'));
fs.copyFileSync('THIRD-PARTY-NOTICES.md',path.join(destination,'THIRD-PARTY-NOTICES.md'));
console.log('Prepared harness and model provenance without model weights:',destination);
