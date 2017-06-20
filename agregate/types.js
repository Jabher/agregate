//@flow

export type primitive = string | boolean | number | null

export type property = primitive | primitive[] | { [string]: primitive }

export type properties = { [string]: property }

export type IEdgeId = number;

export type INodeId = number;

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

export interface ISerializableEdge extends IAbstractEdge<INodeId> {}

export interface IEdge extends IAbstractEdge<INode> {
  label: string,
  properties: properties
}

export interface IReflection<Value> {
  toJS(): Promise<Value>,
  toJSON(): Promise<{
    nodes: ISerializedNode[],
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
  tag: (...vars: { getRawQuery(): string }[]) => IQuery,
  arguments: any[]
}

export interface IAgregate {
  tag: (...vars: { getRawQuery(): string }[]) => IQuery,
  arguments: any[]
}

export interface IConstraintable {
  _constraints: IConstraint[]
}

// eslint-disable-next-line no-unused-vars
export interface IReference<Result> {
  tag: (v: { getRawQuery(): string }[]) => IQuery,

  // run(connection: IConnection, actions: IAction[]): IReflection<Result>;
  // compile(actions: IAction[]): IQuery;
}

export interface ICollectionReference
  extends IReference<INode[]>, IConstraintable {
  where(clause: IWhereClause): ICollectionReference,
  relates(collection: ICollectionReference,
          relationLabel: ?string,
          relationProperties: ?IWhereClause): ICollectionReference,
  relatesTo(collection: ICollectionReference,
            relationLabel: ?string,
            relationProperties: ?IWhereClause): ICollectionReference,
  relatesFrom(collection: ICollectionReference,
              relationLabel: ?string,
              relationProperties: ?IWhereClause): ICollectionReference
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

export interface IAbstractNode<Edge> extends IReference<INode> {
  collection: ILabelCollectionReference,
  label: string,
  properties: properties,
  relationsFrom: Edge[],
  relationsTo: Edge[]
}

export interface INode extends IAbstractNode<IEdge> {}

export interface ISerializedNode extends IAbstractNode<IEdgeId> {}

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

export interface INarrowing {
  order: string[],
  skip: number,
  limit: number
}
