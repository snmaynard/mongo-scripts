mongo-scripts
=============

A collection of useful mongo scripts.

## MergeChunks.js

This script allows you to merge your empty chunks across your entire cluster. Run the script on a mongos instance attached to 2.6 mongods. The script contains a function that takes the following arguments,

`mergeChunks(dbName, collection, keyPattern, sleepValue = 0)`

- `dbName`: Set this to the database name
- `collection`: Set this to the collection you want to merge chunks in
- `keyPattern`: Set this to the key pattern, ie { "_id" : "hashed" }
- `sleepValue`: How long to sleep between each chunk (for backoff) - optional

## SplitChunks

This script allows you to split your chunks on a single shard. Useful when a shard contains significantly more data than others. The script is built using ruby on mongoid as it needs to connect to both a mongos and a mongod. The script contains a function that takes the following arguments,

`split_chunks(db, collection, key_pattern, shard, primary_mongod, split_min = 10, mongos = "localhost:27017")`

- `db`: The database name to split chunks in
- `collection`: The collection to split chunks in
- `key_pattern`: The key pattern used to shard the collection, i.e. {"_id" => 1}
- `shard`: The id of the shard to split chunks on (check sh.status())
- `primary_mongod`: The address and port of the mongod i.e. "mongo.example.com:27017"
- `split_min`: The minimum number of splits required in a chunk to actually split it - optional
- `mongos`: The address and port of the mongos - optional
