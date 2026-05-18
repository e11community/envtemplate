#!/usr/bin/env node
"use strict";var g=require("node:fs/promises");var v=/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;function f(e,n={}){let a=n.env??process.env,u=n.onMissing??"empty";return e.replace(v,(m,p)=>{let t=a[p];if(t!==void 0)return t;if(u==="error")throw new Error(`envsubst: missing environment variable: ${p}`);return u==="keep"?m:""})}async function d(e){let n=await(0,g.readFile)(e.templatePath,"utf8"),a=f(n,{env:e.env,onMissing:e.onMissing});await(0,g.writeFile)(e.outputPath,a,{mode:384})}var h=`Usage: npm-auth [options]

Render a template to an .npmrc file, substituting \${VAR} references from
the environment.

Options:
  --template <path>      Path to template file (default: .npmrc.tmpl)
  --output <path>        Path to output file (default: .npmrc)
  --on-missing <mode>    Behavior on missing var: error | empty | keep
                         (default: empty)
  -h, --help             Show this help and exit
`;function M(e){return e==="error"||e==="empty"||e==="keep"}function w(e){let n=".npmrc.tmpl",a=".npmrc",u="empty",m=!1,p=(t,r,s)=>{if(r!==void 0)return[r,s];let i=e[s+1];if(i===void 0)throw new Error(`Missing value for ${t}`);return[i,s+1]};for(let t=0;t<e.length;t++){let r=e[t],s=r.indexOf("="),i=s===-1?r:r.slice(0,s),l=s===-1?void 0:r.slice(s+1);switch(i){case"-h":case"--help":m=!0;break;case"--template":{let[o,c]=p(i,l,t);n=o,t=c;break}case"--output":{let[o,c]=p(i,l,t);a=o,t=c;break}case"--on-missing":{let[o,c]=p(i,l,t);if(!M(o))throw new Error(`Invalid --on-missing value: ${o} (expected: error, empty, keep)`);u=o,t=c;break}default:throw new Error(`Unknown argument: ${r}`)}}return{template:n,output:a,onMissing:u,help:m}}async function b(){let e;try{e=w(process.argv.slice(2))}catch(n){return process.stderr.write(`${n.message}

${h}`),2}if(e.help)return process.stdout.write(h),0;try{return await d({templatePath:e.template,outputPath:e.output,onMissing:e.onMissing}),0}catch(n){return process.stderr.write(`${n.message}
`),1}}b().then(e=>{process.exit(e)});
