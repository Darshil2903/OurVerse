// Local web server, no npm install or dependencies.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname);
const port = 8947;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end('Method not allowed');return;}
  let raw;
  try{raw=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}
  catch{res.writeHead(400).end('Bad path');return;}
  const absolute=path.resolve(root,'.'+raw,(raw.endsWith('/')?'index.html':''));
  if(!absolute.startsWith(root+path.sep)){res.writeHead(403).end('Forbidden');return;}
  fs.stat(absolute,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404).end('File not found: '+raw);return;}
    res.writeHead(200,{'Content-Type':types[path.extname(absolute).toLowerCase()]||'application/octet-stream','Content-Length':st.size,'Cache-Control':'no-store'});
    if(req.method==='HEAD'){res.end();return;}
    fs.createReadStream(absolute).pipe(res);
  });
}).listen(port,'127.0.0.1',()=>console.log('OurVerse server READY: http://localhost:'+port+'/index.html\nChecker: http://localhost:'+port+'/check.html\nPress Ctrl+C to stop.'));
