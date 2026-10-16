const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Data}=require('resedit');const directory=path.join(__dirname,'../src/assets');
test('應用圖示具透明 PNG、七種 Windows 尺寸與有效 ICNS',()=>{
 const png=fs.readFileSync(path.join(directory,'icon.png'));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),1024);assert.equal(png[25],6);
 const ico=Data.IconFile.from(fs.readFileSync(path.join(directory,'icon.ico')));assert.deepEqual(ico.icons.map(i=>i.data.width),[16,24,32,48,64,128,256]);for(const icon of ico.icons){assert.equal(icon.data.bitCount,32);assert.equal(Buffer.from(icon.data.bin).subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
 const icns=fs.readFileSync(path.join(directory,'icon.icns'));assert.equal(icns.subarray(0,4).toString(),'icns');assert.equal(icns.readUInt32BE(4),icns.length);
 const pkg=require('../package.json');assert.equal(pkg.build.win.icon,'src/assets/icon.ico');assert.equal(pkg.build.win.signExecutable,false);assert.notEqual(pkg.build.win.signAndEditExecutable,false);
});
