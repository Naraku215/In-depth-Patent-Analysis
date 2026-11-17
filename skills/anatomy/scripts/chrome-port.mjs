import {readFileSync} from 'node:fs';
import {join} from 'node:path';
// Edge on Windows may relaunch and exit its launcher successfully. Its isolated
// profile's DevToolsActivePort is the authoritative readiness signal.
export async function chromePort(chrome,profile){
 let stderr='',failure;
 const data=x=>stderr+=String(x);chrome.stderr.on('data',data);chrome.on('error',e=>failure=e);
 const end=Date.now()+20000;let port,browserPath;
 while(Date.now()<end){
  if(failure)throw failure;
  try{const lines=readFileSync(join(profile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);if(/^\d+$/.test(lines[0])){port=Number(lines[0]);browserPath=lines[1];break;}}catch{}
  const m=stderr.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\/(\S+)/);if(m){port=Number(m[1]);browserPath='/'+m[2];break;}
  await new Promise(r=>setTimeout(r,100));
 }
 chrome.stderr.off('data',data);
 if(!port){chrome.kill();throw Error('Browser did not publish a debugging port: '+stderr.slice(-400));}
 chrome.close=async()=>{
  try{await new Promise(resolve=>{const ws=new WebSocket('ws://127.0.0.1:'+port+browserPath);const timer=setTimeout(()=>{ws.close();resolve();},3000);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));ws.onclose=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);resolve();};});}catch{}
  chrome.kill();
 };
 return port;
}
