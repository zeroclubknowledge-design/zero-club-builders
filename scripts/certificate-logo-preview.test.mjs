import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function load(name,imports={}) {
  const exports={};
  const source=fs.readFileSync(new URL('../src/features/certificates/'+name,import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    exports,require:name=>imports[name] || require(name),
  });
  return exports;
}
const design=load('design.ts');
const premium=load('PremiumCertificateArtwork.tsx',{'./design':design});
const {CertificateArtwork}=load('CertificateArtwork.tsx',{'./PremiumCertificateArtwork':premium});
const {CertificateLogoSize}=load('CertificateLogoSize.tsx',{'./design':design});
const branded={...design.emptyCertificateDesign,template:'folio',use_brand:true,brand_logo:'https://example.test/logo.png',brand_name:'Studio Academy'};
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const logoDimensions=html=>{
  const image=html.match(/<image\b[^>]*href="https:\/\/example.test\/logo.png"[^>]*>/)?.[0];
  assert.ok(image,'Uploaded logo appears in the artwork');
  return ['width','height'].map(name=>Number(image.match(new RegExp(`\\b${name}="([^"]+)"`))[1]));
};

test('resizing the uploaded logo visibly changes both sides of every certificate template',()=>{
  for(const template of design.certificateTemplates) for(const side of ['front','back']) {
    const initial=logoDimensions(render(CertificateArtwork,{design:{...branded,template:template.id,brand_logo_scale:1},side}));
    const bigger=logoDimensions(render(CertificateArtwork,{design:{...branded,template:template.id,brand_logo_scale:2},side}));
    assert.ok(bigger[0]>initial[0] && bigger[1]>initial[1],`${template.id} ${side} grows in preview`);
  }
});

test('preview controls show the current percentage and respect branding and disabled state',()=>{
  const markup=render(CertificateLogoSize,{design:{...branded,brand_logo_scale:1.65},disabled:true,onChange(){}});
  assert.match(markup,/165%/);assert.match(markup,/value="1.65"/);assert.match(markup,/disabled=""/);
  assert.equal(render(CertificateLogoSize,{design:{...branded,use_brand:false},onChange(){}}),'');
  assert.equal(render(CertificateLogoSize,{design:{...branded,brand_logo:''},onChange(){}}),'');
  assert.equal(design.logoScale({...branded,brand_logo_scale:99}),2);
  assert.equal(design.logoScale({...branded,brand_logo_scale:0}),1);
});

test('new credentials contain complete identity, programme and working verification links',()=>{
  for(const template of design.certificateTemplates) for(const side of ['front','back']) {
    const html=render(CertificateArtwork,{design:{...branded,template:template.id,artwork_version:2,signer_name:'Dr Taylor Smith',signature_url:'https://example.test/signature.png'},side,
      learner:'Alexandra Chiamaka Morgan',course:'Advanced Product Design and Research',code:'ZC-CERT-123',date:'24 October 2026',hours:36});
    assert.match(html,/Alexandra Chiamaka Morgan/);assert.match(html,/Advanced Product Design and Research/);
    assert.match(html,/Dr Taylor Smith/);assert.match(html,/24 October 2026/);
    assert.match(html,/href="https:\/\/zeroclubs.xyz\/certificate\/ZC-CERT-123"/);
    assert.doesNotMatch(html,/SAMPLE|NOT ISSUED|accredited|internationally approved/i);
    if(side==='back') assert.match(html,/36 hours/);
  }
});

test('all designs use the redesigned artwork without legacy fallback',()=>{
  const historical={...branded};delete historical.artwork_version;
  assert.match(render(CertificateArtwork,{design:historical,code:'ZC-NEW'}),/Certificate of Completion/);
});

test('appearance settings control both faces, typography, wording and decorations',()=>{
  const appearance={background_color:'#101112',back_background_color:'#202122',text_color:'#eeeeee',secondary_text_color:'#bbbbbb',title_color:'#123456',recipient_color:'#234567',course_color:'#345678',accent_color:'#456789',border_color:'#567890',panel_color:'#678901',panel_text_color:'#789012',signature_background_color:'#890123',body_font:'trebuchet',heading_font:'arial',recipient_font:'times',title_size:48,recipient_size:50,course_size:24,alignment:'left',heading:'Certificate of Achievement',recipient_label:'PRESENTED TO',completion_text:'Completed with distinction',recognition_text:'Recognized for practical excellence'};
  for(const template of design.certificateTemplates) {
    const customized={...branded,template:template.id,signature_url:'https://example.test/signature.png',appearance};
    const front=render(CertificateArtwork,{design:customized});
    const back=render(CertificateArtwork,{design:customized,side:'back'});
    for(const colour of ['#101112','#eeeeee','#bbbbbb','#123456','#234567','#345678','#456789','#567890','#890123']) assert.ok(front.includes(colour),`${template.id} uses ${colour}`);
    for(const colour of ['#202122','#678901','#789012']) assert.ok(back.includes(colour));
    for(const text of ['Certificate of Achievement','PRESENTED TO','Completed with distinction','Recognized for practical excellence']) assert.ok(front.includes(text));
    assert.match(front,/Trebuchet MS/);assert.match(front,/Times New Roman/);assert.match(front,/font-size="48"/);assert.match(front,/font-size="50"/);assert.match(front,/font-size="24"/);
    assert.match(front,/<text x="88" y="220"/);
    const clean=render(CertificateArtwork,{design:{...customized,appearance:{...appearance,show_seal:false,show_texture:false,show_ornaments:false,heading:''}}});
    assert.doesNotMatch(clean,/Certificate of Achievement|url\(#|aria-hidden="true"/);
    assert.notEqual(clean,front);
    assert.equal(design.certificateAppearanceError(appearance),null);
  }
});

test('appearance validation rejects invalid settings and reset restores template defaults',()=>{
  for(const appearance of [{text_color:'red'},{title_size:100},{recipient_size:0},{course_size:'20'},{body_font:'__proto__'},{show_seal:'yes'},{heading:'a'.repeat(121)},{alignment:'right'}]) assert.ok(design.certificateAppearanceError(appearance));
  assert.equal(design.certificateAppearanceError(undefined),null);
  assert.equal(design.certificatePalette({...branded,appearance:{background_color:'invalid'}}).paper,design.certificatePalettes.folio.paper);
  assert.equal(design.certificatePalette({...branded,appearance:undefined}).paper,design.certificatePalettes.folio.paper);
});
