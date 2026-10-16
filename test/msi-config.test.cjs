const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),configure=require('../scripts/configure-msi.cjs');
test('MSI 的中文名稱使用一致的繁體中文資料庫與摘要編碼',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'photomv-msi-')),file=path.join(dir,'project.wxs');
 try{
  await fs.copyFile(path.join(__dirname,'../node_modules/app-builder-lib/templates/msi/template.xml'),file);await configure(file);const xml=await fs.readFile(file,'utf8');assert(xml.includes('Language="1028" Codepage="950"'));assert(xml.includes('SummaryCodepage="950"'));
  await fs.writeFile(file,'<unsupported/>');await assert.rejects(configure(file),/Unsupported/);assert.equal(await fs.readFile(file,'utf8'),'<unsupported/>');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
