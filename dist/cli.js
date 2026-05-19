#!/usr/bin/env node
"use strict";var g=require("fs/promises");var v=/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;function d(e,t={}){let a=t.env??process.env,u=t.onMissing??"empty";return e.replace(v,(m,p)=>{let n=a[p];if(n!==void 0)return n;if(u==="error")throw new Error(`envsubst: missing environment variable: ${p}`);return u==="keep"?m:""})}async function f(e){let t=await(0,g.readFile)(e.templatePath,{encoding:"utf8"}),a=d(t,{env:e.env,onMissing:e.onMissing});await(0,g.writeFile)(e.outputPath,a,{mode:384})}var h=`Usage: npm-auth [options]

Render a template to an .npmrc file, substituting \${VAR} references from
the environment.

Options:
  --template <path>      Path to template file (default: .npmrc.tmpl)
  --output <path>        Path to output file (default: .npmrc)
  --on-missing <mode>    Behavior on missing var: error | empty | keep
                         (default: empty)
  -h, --help             Show this help and exit
`;function M(e){return e==="error"||e==="empty"||e==="keep"}function w(e){let t=".npmrc.tmpl",a=".npmrc",u="empty",m=!1,p=(n,r,s)=>{if(r!==void 0)return[r,s];let i=e[s+1];if(i===void 0)throw new Error(`Missing value for ${n}`);return[i,s+1]};for(let n=0;n<e.length;n++){let r=e[n],s=r.indexOf("="),i=s===-1?r:r.slice(0,s),l=s===-1?void 0:r.slice(s+1);switch(i){case"-h":case"--help":m=!0;break;case"--template":{let[o,c]=p(i,l,n);t=o,n=c;break}case"--output":{let[o,c]=p(i,l,n);a=o,n=c;break}case"--on-missing":{let[o,c]=p(i,l,n);if(!M(o))throw new Error(`Invalid --on-missing value: ${o} (expected: error, empty, keep)`);u=o,n=c;break}default:throw new Error(`Unknown argument: ${r}`)}}return{template:t,output:a,onMissing:u,help:m}}async function b(){let e;try{e=w(process.argv.slice(2))}catch(t){return process.stderr.write(`${t.message}

${h}`),2}if(e.help)return process.stdout.write(h),0;try{return await f({templatePath:e.template,outputPath:e.output,onMissing:e.onMissing}),0}catch(t){return process.stderr.write(`${t.message}
`),1}}b().then(e=>{process.exit(e)});
