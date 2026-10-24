/*
 * OurVerse — interactive front page
 * Uses the actual uploaded boy.glb and girl.glb, with their Blender armature controls:
 * Root > Neck > Head > Eye.L / Eye.R
 * No waving or full-body animation is required. Arms and body stay static.
 * The GLB exporter may rename Eye.L to EyeL; lookup intentionally supports both.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window.__ourverseAppStarted = true;

const DEG = Math.PI / 180;
const YAW_AXIS = new THREE.Vector3(0, 1, 0);
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
const loader = new GLTFLoader();
const $ = (s) => document.querySelector(s);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dampFactor = (speed, dt) => 1 - Math.exp(-speed * Math.min(dt, .08));
const defaultConfigs = {
  boy: { zoom: 1.06, shiftX: -.015, shiftY: .005, angle: 4, headYaw: 7, eyeYaw: 13, headPitch: 4.5, eyePitchUp: 8, eyePitchDown: 8 },
  girl: { zoom: 1.08, shiftX: .005, shiftY: -.005, angle: -4, headYaw: 6, eyeYaw: 13, headPitch: 4, eyePitchUp: 8, eyePitchDown: 7 }
};
function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem('ourverse-tuning-v1') || '{}');
    return Object.fromEntries(['boy','girl'].map(k => [k, {...defaultConfigs[k], ...(parsed[k] || {})}]));
  } catch { return structuredClone(defaultConfigs); }
}
const configs = loadSettings();
const saveSettings = () => { try { localStorage.setItem('ourverse-tuning-v1', JSON.stringify(configs)); } catch {} };
const cursor = {targetX:0,targetY:0,x:0,y:0,enabled:!window.matchMedia('(prefers-reduced-motion: reduce)').matches};
let lookOverride = null;
let lookOverrideUntil = 0;
let tuneSelected = 'boy';

window.addEventListener('pointermove', (event) => {
  if (event.target instanceof Element && event.target.closest('.tune-panel')) return;
  if (event.pointerType === 'touch') return;
  cursor.targetX = clamp((event.clientX / window.innerWidth) * 2 - 1, -1, 1);
  cursor.targetY = clamp(1 - (event.clientY / window.innerHeight) * 2, -1, 1);
  lookOverride = null;
}, {passive:true});
window.addEventListener('pointerleave', () => { cursor.targetX = 0; cursor.targetY = 0; });

const normalized = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function findControl(root, target) {
  const needle = normalized(target);
  let best = null;
  root.traverse((object) => {
    if (best) return;
    const aliases = [object.name, object.userData?.rigName, object.userData?.name, object.userData?.originalName];
    if (aliases.some(a => normalized(a) === needle)) best = object;
  });
  return best;
}

const tempYaw = new THREE.Quaternion();
const tempPitch = new THREE.Quaternion();
const tempDelta = new THREE.Quaternion();
const tempDesired = new THREE.Quaternion();
function applyYawPitch(control, neutralQ, yawDegrees, pitchUpDegrees, amount) {
  if (!control || !neutralQ) return;
  // GLB forward is +Z; yaw + around Y turns toward image-right.
  // Pitch is negative around X when looking upward.
  tempYaw.setFromAxisAngle(YAW_AXIS, yawDegrees * DEG);
  tempPitch.setFromAxisAngle(PITCH_AXIS, -pitchUpDegrees * DEG);
  tempDelta.copy(tempYaw).multiply(tempPitch);
  tempDesired.copy(neutralQ).multiply(tempDelta);
  control.quaternion.slerp(tempDesired, amount);
}

class CharacterView {
  constructor(key, canvasId, stageId, url) {
    this.key = key;
    this.canvas = document.getElementById(canvasId);
    this.stage = document.getElementById(stageId);
    this.indicator = document.getElementById(`${key}Loading`);
    this.url = url;
    this.config = configs[key];
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1,1,1,-1,.01,100);
    this.camera.position.set(0,.5,3);
    this.camera.lookAt(0,.5,0);
    this.renderer = new THREE.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:true,powerPreference:'high-performance',premultipliedAlpha:false});
    this.renderer.setClearColor(0x000000,0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.4 : 1.75));
    this.cameraBase = null;
    this.controls = {};
    this.neutral = {};
    this.status = 'loading';
    this.installLights();
    this.resize();
    this.load();
  }
  installLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff8e8,0x83648d,2.15));
    const key = new THREE.DirectionalLight(0xffe1b2,3.0);
    key.position.set(this.key==='boy'? 1.6 : -1.8,3.2,4.5);
    this.scene.add(key);
    const glow = new THREE.DirectionalLight(0xffa078,1.35);
    glow.position.set(this.key==='boy'? -3.2:3.2, 2.0, -1.6);
    this.scene.add(glow);
    const front = new THREE.DirectionalLight(0xffe5f0,.65);
    front.position.set(0,1,5);
    this.scene.add(front);
  }
  load() {
    loader.load(this.url, (result) => {
      const root = result.scene;
      this.character = root;
      this.scene.add(root);
      this.controls = {
        Root: findControl(root,'Root'),
        Neck: findControl(root,'Neck'),
        Head: findControl(root,'Head'),
        EyeL: findControl(root,'Eye.L'),
        EyeR: findControl(root,'Eye.R')
      };
      for (const [k,c] of Object.entries(this.controls)) if(c) this.neutral[k] = c.quaternion.clone();
      // Both original GLBs are Blender exports, Y-up, face +Z.
      // Rotate the whole character by only a few degrees to face the middle of the page.
      this.character.rotation.y = this.config.angle * DEG;
      const bounds = new THREE.Box3().setFromObject(root);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      // Do not scale or apply transforms to rigged bones. Position via the camera.
      this.cameraBase = {size,center};
      this.fitCamera();
      this.status = 'ready';
      this.stage.classList.add('ready');
      this.indicator.setAttribute('aria-hidden', 'true');
      this.logStatus();
      document.getElementById('globalStatus').textContent = 'The OurVerse 3D characters are ready.';
      const warning = document.getElementById('startupWarning');
      if (warning && Array.from(document.querySelectorAll('.character-stage')).every(s => s.classList.contains('ready'))) warning.hidden = true;
      console.info(`[OurVerse] ${this.key} loaded.`, 'rig controls:', Object.fromEntries(Object.entries(this.controls).map(([k,v])=>[k, v?.name ?? 'NOT FOUND'])));
    }, (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.round(100 * event.loaded / event.total);
        this.indicator.innerHTML = `<span class="load-circle"></span> Loading ${this.key} ${pct}%`;
      }
    }, (error) => {
      this.status = 'error';
      this.indicator.classList.add('error');
      this.indicator.textContent = `Could not load ${this.key}. Start using a local server; see README.`;
      console.error(`[OurVerse] ${this.key} model error:`, error);
      this.logStatus();
      document.getElementById('globalStatus').textContent = `${this.key} model could not be loaded.`;
      const warning=document.getElementById('startupWarning');
      warning.hidden=false;
      document.getElementById('startupWarningText').textContent=`Could not load models/${this.key}.glb: ${error?.message || error}. Try http://localhost:8947/check.html for more details.`;
    });
  }
  fitCamera() {
    if(!this.cameraBase) return;
    const rect = this.canvas.getBoundingClientRect();
    const aspect = Math.max(.15, rect.width / Math.max(rect.height, 1));
    const {size,center} = this.cameraBase;
    const baseHeight = Math.max(size.y / .94, size.x / (aspect * .965));
    const height = baseHeight / Math.max(.5, this.config.zoom);
    this.camera.left = -height * aspect / 2;
    this.camera.right = height * aspect / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
    const cx = center.x - this.config.shiftX * height;
    const cy = center.y - this.config.shiftY * height;
    const cz = center.z;
    this.camera.position.set(cx,cy,cz + Math.max(2.5,size.z * 4));
    this.camera.lookAt(cx,cy,cz);
  }
  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1,Math.round(bounds.width));
    const height = Math.max(1,Math.round(bounds.height));
    this.renderer.setSize(width,height,false);
    this.fitCamera();
  }
  applyMotion(x,y,dt) {
    if (this.status!=='ready') return;
    const cfg=this.config;
    const p = dampFactor(7.8,dt);
    const e = dampFactor(12.0,dt);
    const yaw = cfg.headYaw*x;
    const pitch = cfg.headPitch*y;
    applyYawPitch(this.controls.Neck, this.neutral.Neck, yaw*.32,pitch*.32,p);
    applyYawPitch(this.controls.Head, this.neutral.Head, yaw*.68,pitch*.68,p);
    const eyeYaw = cfg.eyeYaw * x;
    const eyePitch = y >= 0 ? cfg.eyePitchUp*y : cfg.eyePitchDown*y;
    applyYawPitch(this.controls.EyeL, this.neutral.EyeL, eyeYaw,eyePitch,e);
    applyYawPitch(this.controls.EyeR, this.neutral.EyeR, eyeYaw,eyePitch,e);
  }
  updateConfig() {
    if (!this.character) return;
    this.character.rotation.y = this.config.angle * DEG;
    this.fitCamera();
  }
  logStatus() {
    if(tuneSelected!==this.key) return;
    const pairs=Object.entries(this.controls).map(([name,node])=>`${name}: ${node? '✓ '+node.name : '✗ not found'}`);
    $('#rigDiagnostics').textContent = `Model: ${this.key} — ${this.status}\n${pairs.join('\n')}`;
  }
  render() { if(this.renderer) this.renderer.render(this.scene,this.camera); }
}

const views = {};
try {
  views.boy = new CharacterView('boy','boyCanvas','boyStage','./models/boy.glb');
  views.girl = new CharacterView('girl','girlCanvas','girlStage','./models/girl.glb');
} catch(e) {
  console.error('WebGL initialization failed:', e);
  ['boy','girl'].forEach(k => {
    const indicator=$(`#${k}Loading`);
    if(indicator) {indicator.textContent='Your browser could not start 3D. Try Chrome/Edge with hardware acceleration.';indicator.classList.add('error')}
  });
}
let priorFrame=performance.now();
function render(time) {
  requestAnimationFrame(render);
  if(document.hidden) {priorFrame=time;return;}
  const dt=clamp((time-priorFrame)/1000,.001,.1);
  priorFrame=time;
  if (lookOverride && time < lookOverrideUntil) {
    cursor.targetX=lookOverride[0];cursor.targetY=lookOverride[1];
  } else if (lookOverride && time >= lookOverrideUntil) {
    lookOverride=null;cursor.targetX=0;cursor.targetY=0;
  }
  const follow=dampFactor(4.9,dt);
  cursor.x+=((cursor.enabled?cursor.targetX:0)-cursor.x)*follow;
  cursor.y+=((cursor.enabled?cursor.targetY:0)-cursor.y)*follow;
  for(const v of Object.values(views)) {
    v.applyMotion(cursor.x,cursor.y,dt);
    v.render();
  }
}
requestAnimationFrame(render);
let resizeTimer;
window.addEventListener('resize',()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>Object.values(views).forEach(v=>v.resize()),75);
},{passive:true});

// Controls are hidden during normal page viewing. Press D to tune model framing.
const panel = $('#tunePanel');
function setPanel(open) {
  panel.hidden=!open;
  if(open) { updateTuningUI(); views[tuneSelected]?.logStatus(); }
}
$('#tuneButton').addEventListener('click',()=>setPanel(panel.hidden));
$('#closeTune').addEventListener('click',()=>setPanel(false));
window.addEventListener('keydown',e=>{
  if((e.key.toLowerCase()==='d') && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) setPanel(panel.hidden);
  if(e.key==='Escape') {setPanel(false); closeExperience();}
});
$('#tunePanel').querySelectorAll('[data-side]').forEach(button=>button.addEventListener('click',()=>{
  tuneSelected=button.dataset.side;
  updateTuningUI();views[tuneSelected]?.logStatus();
}));
const fields = ['zoom','shiftX','shiftY','angle','headYaw','eyeYaw'];
function updateTuningUI() {
  $('#tunePanel').querySelectorAll('[data-side]').forEach(b=>b.classList.toggle('selected',b.dataset.side===tuneSelected));
  for(const field of fields) {
    const input=$(`#${field}Slider`);
    input.value=configs[tuneSelected][field];
    $(`[data-out="${field}"]`).textContent=(+input.value).toFixed(field==='angle'?0:2);
  }
}
for(const field of fields) {
  $(`#${field}Slider`).addEventListener('input',event=>{
    const value=+event.target.value;
    configs[tuneSelected][field]=value;
    $(`[data-out="${field}"]`).textContent=value.toFixed(field==='angle'?0:2);
    views[tuneSelected]?.updateConfig();
    saveSettings();
  });
}
$('#trackingToggle').checked=cursor.enabled;
$('#trackingToggle').addEventListener('change',event=>{
  cursor.enabled=event.target.checked;
  if (!cursor.enabled) {cursor.targetX=0;cursor.targetY=0;}
});
$('#tunePanel').querySelectorAll('[data-look]').forEach(button=>button.addEventListener('click',()=>{
  lookOverride=button.dataset.look.split(',').map(Number);
  lookOverrideUntil=performance.now()+2200;
  cursor.enabled=true;
  $('#trackingToggle').checked=true;
}));
$('#resetTuning').addEventListener('click',()=>{
  Object.assign(configs[tuneSelected],defaultConfigs[tuneSelected]);
  views[tuneSelected]?.updateConfig();
  updateTuningUI();saveSettings();
});
$('#copyTuning').addEventListener('click',async ()=>{
  const setting=JSON.stringify(configs,null,2);
  try {await navigator.clipboard.writeText(setting);$('#copyTuning').textContent='Copied!';setTimeout(()=>$('#copyTuning').textContent='Copy settings',1500)}
  catch {prompt('Copy these tuning settings:',setting)}
});

const experience=$('#experienceScreen');
const startButton=$('#startButton');
const backButton=$('#goBackButton');
function openExperience() {
  experience.classList.add('open');experience.setAttribute('aria-hidden','false');
  backButton.focus();
}
function closeExperience() {
  if(!experience.classList.contains('open'))return;
  experience.classList.remove('open');experience.setAttribute('aria-hidden','true');
  startButton.focus();
}
startButton.addEventListener('click',openExperience);
backButton.addEventListener('click',closeExperience);
experience.addEventListener('click',e=>{if(e.target===experience)closeExperience()});
