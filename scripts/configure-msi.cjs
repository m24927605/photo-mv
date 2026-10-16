const fs=require('node:fs/promises');
module.exports=async file=>{
  const xml=await fs.readFile(file,'utf8');
  const product='Language="1033" Codepage="65001"',packageTag='<Package Compressed="yes" InstallerVersion="500"/>';
  if(!xml.includes(product)||!xml.includes(packageTag))throw Error('Unsupported electron-builder MSI template');
  // Both the MSI database and summary metadata must encode the Chinese product name.
  await fs.writeFile(file,xml.replace(product,'Language="1028" Codepage="950"').replace(packageTag,'<Package Compressed="yes" InstallerVersion="500" SummaryCodepage="950"/>'));
};
