//@flow

export type primitive = string | boolean | number | null

export type property = primitive | primitive[] | {[string]: primitive}

export type properties = { [string]: property }

export interface IQuery {
  statement: string,
  properties: properties
}

export interface IAbstractEdge<Node> {
  from: Node,
  to: Node,
  label: string,
  properties: properties
}

export interface ISerializableEdge extends IAbstractEdge<number> {}

export interface IEdge extends IAbstractEdge<IRecord> {
  label: string,
  properties: properties
}

export interface IReflection<Value> {
  toJS(): Promise<Value>,
  toJSON(): Promise<{
    nodes: ISerializedRecord[],
    relations: ISerializableEdge[]
  }>
}

interface RunFn<T> {
  (query: IQuery<T>): IReflection<T>
}

export interface IConnection {
  constructor(): void,
  register(labelCollection: ILabelCollectionReference): Promise<void>,

  run: RunFn<any>
}

export interface IWhereClause {
  $gt?: number,
  $gte?: number,
  $lt?: number,
  $lte?: number,
  $exists?: boolean,
  $startsWith?: string | string[],
  $endsWith?: string | string[],
  $contains?: string | string[],
  $has?: primitive,
  $in?: primitive[]
}

export interface IAction {
  tag: (...vars: {getRawQuery(): string}[]) => IQuery,
  arguments: any[]
}

export interface IAgregate {
  tag: (...vars: {getRawQuery(): string}[]) => IQuery,
  arguments: any[]
}

export interface IConstraintable {
  _constraints: IConstraint[]
}

export interface IReference<Result> {
  tag: (v: {getRawQuery(): string}[]) => IQuery,

  // run(connection: IConnection, actions: IAction[]): IReflection<Result>;
  // compile(actions: IAction[]): IQuery;
}

export interface ICollectionReference
  extends IReference<INode[]>, IConstraintable {
  where(clause: IWhereClause): ICollectionReference,
  intersects(collection: ICollectionReference): ICollectionReference,
  relates(collection: ICollectionReference,
          relationLabel: ?string,
          relationProperties: ?IWhereClause): ICollectionReference,
  relatesTo(collection: ICollectionReference,
            relationLabel: ?string,
            relationProperties: ?IWhereClause): ICollectionReference,
  relatesFrom(collection: ICollectionReference,
              relationLabel: ?string,
              relationProperties: ?IWhereClause): ICollectionReference,
  subset(skip: number, limit: number): ICollectionReference,
  order(...order: string[]): ICollectionReference
}

export interface ILabelRecordDescriptor {
  label: string,
  unique?: string[],
  uniqueMulti?: string[][],
  indexed?: string[],
  exists?: string[]
}

export interface ILabelCollectionReference
  extends ICollectionReference, ILabelRecordDescriptor {
  register(connection: IConnection): Promise<void>
}

export interface INode extends IReference<INode> {
  collection: ILabelCollectionReference,
  label: string,
  properties: properties,
  relationsFrom: IEdge[],
  relationsTo: IEdge[]
}

export interface IRecord {
  node_: INode,
  [string]: property
}

export interface ISerializedRecord {}

export type IConstraint =
  | { type: "label", label: string }
  | {
  type: "relation",
  other: ICollectionReference,
  direction: number,
  label: ?string,
  clause: ?IWhereClause
}
  | { type: "where", clause: IWhereClause }
  | { type: "order", order: string[] }
  | { type: "subset", skip: number, limit: number }
