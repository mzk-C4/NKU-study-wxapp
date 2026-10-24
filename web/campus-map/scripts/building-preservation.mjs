import ts from 'typescript'
import {createHash} from 'node:crypto'
export const sourceHash=text=>createHash('sha256').update(text).digest('hex')
export function protectedBuildingNodes(source){
  const file=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true),nodes={}
  function visit(node){
    if(ts.isFunctionDeclaration(node)&&node.name&&(/^(create(?!Renderer)|make)/.test(node.name.text)||node.name.text==='squareFootprint'))nodes[node.name.text]=sourceHash(node.getText(file))
    if(ts.isExpressionStatement(node)&&node.getText(file).startsWith('campusModel.buildings.forEach'))nodes['building-assembly']=sourceHash(node.getText(file))
    if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations)if(ts.isIdentifier(declaration.name)&&(/Materials$/.test(declaration.name.text)||declaration.name.text==='categoryColors'))nodes[declaration.name.text]=sourceHash(declaration.getText(file))
    ts.forEachChild(node,visit)
  }
  visit(file);return nodes
}
