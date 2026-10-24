import {readFile} from 'node:fs/promises'
import {dirname,resolve,extname} from 'node:path'
import ts from 'typescript'
const urls=new Map()
export async function localTsUrl(path){
  const absolute=resolve(path);if(urls.has(absolute))return urls.get(absolute)
  let code=ts.transpileModule(await readFile(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  const specs=[...code.matchAll(/from (['"])([^'"]+)\1/g)]
  for(const match of specs){const name=match[2],target=name.startsWith('.')?await localTsUrl(resolve(dirname(absolute),name+(extname(name)?'':'.ts'))):import.meta.resolve(name);code=code.replace(match[0],`from ${JSON.stringify(target)}`)}
  const url=`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;urls.set(absolute,url);return url
}
export async function loadLocalTs(path){return import(await localTsUrl(path))}
