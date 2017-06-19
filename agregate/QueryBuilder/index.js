// @flow
import R from "ramda";
import type { IAction, IAgregate, ICollectionReference } from "../types";
import { Cypher as C, Var } from "../cypher";

class Awareness {
  collections: WeakMap<ICollectionReference, Var> = new WeakMap();

  register(collection: ICollectionReference) {
    if (this.collections.has(collection)) {
      return;
    }

    this.collections.set(collection, new Var());
    if (Array.isArray(collection._constraints)) {
      collection._constraints
        .filter(R.propEq("type", "relation"))
        .map(R.prop("other"))
        .forEach(collection => {
          this.register(collection);
        })
    }
  }

  getVariable(collection: ICollectionReference): Var {
    //$FlowFixMe
    return this.collections.get(collection);
  }
}

const extractActionCollections = R.pipe(
  R.map(R.prop('arguments')),
  R.filter(argument => Array.isArray(argument._constraints)),
  R.flatten
);

let awareness: ?Awareness;

export class QueryBuilder {
  static compile(actions: IAction[], returns: { [string]: IAgregate } = {}) {
    const localAwareness = awareness = new Awareness()
    const collections = [
      ...extractActionCollections(actions),
      ...extractActionCollections(returns)
    ]

    collections
      .forEach(collection => localAwareness.register(collection))

    const returnsKeys = Object.keys(returns)

    const toTag = val => val.tag(...val.arguments.map(arg => localAwareness.getVariable(arg)))


    const actionQueries = actions.map(toTag)
    const returnQueries = R.mapObjIndexed(toTag, returnsKeys)

    const result = C.tag`
      ${collections.map(collection => collection.tag(awareness))}
    
      ${actionQueries}
      
      return ${
      returnsKeys.length === 0
        ? C.raw('true')
        : returnsKeys.map(key => C.tag`${returnQueries[key]} as ${C.raw(key)}`)
      }
    `
    awareness = undefined;
    return result;
  }

  static checkIfBootstrapRequired() {
    return C.tag`
      match (originalState:AgregateState_)     
      return count(originalState) as stateCount
    `
  }

  static bootstrap() {
    return C.tag`
      	create (originalState:AgregateState_ {version: "1.0"})
      	
      	create constraint on (migrations:AgregateMigrationState_) assert migrations.label is unique
	      create constraint on (migrations:AgregateMigrationState_) assert exists(migrations.label)
	      
	      return true
    `
  }

  static getMigratedState(label: string) {
    return C.tag`
    	merge (migration:AgregateMigrationState_ {label: ${label})
    	on create set migration += {unique: [], uniqueMulti: [], indexed: [], exists: []}
    `
  }

  static migration(label: string, addDescriptor: IDescriptorProps, dropDescriptor: IDescriptorProps) {
    return C.tag`
      ${addDescriptor.indexed.map(key => C.tag`create index on :${C.raw(label)}(${C.raw(key)})`)}
      ${dropDescriptor.indexed.map(key => C.tag`drop index on :${C.raw(label)}(${C.raw(key)})`)}
      
      ${addDescriptor.uniqueMulti.map(keys => C.tag`create constraint on (entity:${C.raw(label)}) 
      assert (${C.raw(keys.map(i => `value.${i}`).join(","))}) is node key`)}
      ${dropDescriptor.uniqueMulti.map(keys => C.tag`drop constraint on (entity:${C.raw(label)}) 
      assert (${C.raw(keys.map(i => `value.${i}`).join(","))}) is node key`)}
      
      ${addDescriptor.unique.map(keys => C.tag`create constraint on (entity:${C.raw(label)}) 
      assert (${C.raw(keys.map(i => `value.${i}`).join(","))}) is unique`)}
      ${dropDescriptor.unique.map(keys => C.tag`drop constraint on (entity:${C.raw(label)}) 
      assert (${C.raw(keys.map(i => `value.${i}`).join(","))}) is unique`)}
      
      ${addDescriptor.exists.map(keys => C.tag`create constraint on (entity:${C.raw(label)}) 
      assert exists(${C.raw(keys.map(i => `value.${i}`).join(","))}`)}
      ${dropDescriptor.exists.map(keys => C.tag`drop constraint on (entity:${C.raw(label)}) 
      assert exists(${C.raw(keys.map(i => `value.${i}`).join(","))}`)}
    `;
  }
}

interface IDescriptorProps {
  unique: string[],
  uniqueMulti: string[][],
  indexed: string[],
  exists: string[]
}