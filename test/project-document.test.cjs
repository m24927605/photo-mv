const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createProject}=require('../src/model.js');const {makeDocument,readDocument}=require('../src/project-document.cjs');
const snapshot=()=>({state:{project:createProject(),textUndo:[],textRedo:[]},ui:{selected:-1,playhead:0,textIndex:-1,textToolsVisible:false,toolbarPosition:null,musicOpen:false,scrollLeft:0}});
test('空專案可儲存，專案文件只包含使用中的來源並可往返',()=>{
 const empty=snapshot();assert.deepEqual(readDocument(makeDocument(empty,new Map())).snapshot,empty);
 const value=snapshot();value.state.project.slides=[{asset:'photo',name:'地球',duration:3,texts:[]}];value.ui.selected=0;
 const file=path.join(__dirname,'fixtures/earth.jpg'),assets=new Map([['photo',{id:'photo',name:'地球',file,kind:'photo',ext:'jpg'}],['unused',{id:'unused',name:'unused',file,kind:'photo',ext:'jpg'}]]);
 const doc=makeDocument(value,assets);assert.equal(doc.assets.length,1);const restored=readDocument(JSON.parse(JSON.stringify(doc)));assert.deepEqual(restored.snapshot,value);assert.equal(restored.assets.get('photo').file,file);
});
test('拒絕壞格式、未知來源、錯誤類型與相對資產路徑',()=>{
 assert.throws(()=>readDocument({format:2,assets:[]}));assert.throws(()=>readDocument({format:1,assets:[]}));
 const value=snapshot();value.state.project.slides=[{asset:'x',duration:3,texts:[]}];value.ui.selected=0;assert.throws(()=>makeDocument(value,new Map()));
 for(const source of [{id:'x',name:'x',file:'relative.jpg',kind:'photo',ext:'jpg'},{id:'x',name:'x',file:path.join(__dirname,'fixtures/earth.jpg'),kind:'music',ext:'jpg'}])assert.throws(()=>readDocument({format:1,...value,assets:[source]}));
});

test('下一步記錄必須通過文字資料驗證',()=>{
 for(const redo of [null,{},[['a',{}]],[['a',[[{value:'invalid'}]]]]]){const value=snapshot();value.state.textRedo=redo;assert.throws(()=>makeDocument(value,new Map()));}
 const value=snapshot();value.state.textRedo=[];assert.deepEqual(readDocument(makeDocument(value,new Map())).snapshot,value);
});
