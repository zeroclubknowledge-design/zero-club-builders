import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/features/calls/videoQuality.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const {groupVideoStream,cameraQualityStep,CALL_CAMERA_CONFIG,CALL_LOW_STREAM}=exports;
test('group calls keep the four main camera tiles in HD when more people join',()=>{
  const choose=patch=>groupVideoStream({screen:false,minimized:false,presentation:false,cameraIndex:0,speaking:false,...patch});
  for(let cameraIndex=0;cameraIndex<4;cameraIndex++)assert.equal(choose({cameraIndex}),0);
  assert.equal(choose({cameraIndex:7}),1);
  assert.equal(choose({cameraIndex:7,speaking:true}),0);
  assert.equal(choose({presentation:true}),1);
  assert.equal(choose({screen:true,presentation:true,cameraIndex:-1}),0);
  assert.equal(choose({screen:true,minimized:true}),1);
  assert.equal(CALL_CAMERA_CONFIG.encoderConfig.height,720);
  assert.equal(CALL_LOW_STREAM.height,360);
});
test('network adaptation steps down only after sustained congestion and restores the chosen quality',()=>{
  const order=['480p','540p','720p','1080p'];
  assert.equal(cameraQualityStep(order,'720p','720p',2,0),null);
  assert.equal(cameraQualityStep(order,'720p','720p',3,0),'540p');
  assert.equal(cameraQualityStep(order,'540p','720p',0,9),null);
  assert.equal(cameraQualityStep(order,'540p','720p',0,10),'720p');
  assert.equal(cameraQualityStep(order,'720p','720p',0,10),null);
  assert.equal(cameraQualityStep(order,'480p','480p',3,0),null);
  assert.equal(cameraQualityStep(order,'480p','480p',0,10),null);
});
