import {Connection, Record} from './agregate';

const connection = new Connection('localhost', {username: 'neo4j', password: 'password'});

class ConnectedRecord extends Record {
    static connection = connection;
}

export class Foo extends ConnectedRecord {}

// this is the only confusing thing here
// but this is required for querying:
// if you are looking for random record,
// you need the original class to resolve it into es6 class
Foo.register();