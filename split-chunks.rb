#
# REQUIRED PARAMS
# db: The database name to split chunks in
# collection: The collection to split chunks in
# key_pattern: The key pattern used to shard the collection, i.e. {"_id" => 1}
# shard: The id of the shard to split chunks on (check sh.status())
# primary_mongod: The address and port of the mongod i.e. "mongo.example.com:27017"
#
# OPTIONAL PARAMS
# split_min: The minimum number of splits required in a chunk to actually split it (default: 10)
# The address and port of the mongos (default: "localhost:27017")
#
def split_chunks(db, collection, key_pattern, shard, primary_mongod, split_min = 10, mongos = "localhost:27017")
  ns = "#{db}.#{collection}"
  db = Moped::Session.new(["primary_mongod"], auto_discover: false)
  mongos = Moped::Session.new([mongos], auto_discover: false)
  mongos.with(database: :config)[:chunks].find({ns: ns, shard: shard}).sort(max: 1).each_with_index do |chunk, index|
    puts index
    begin
      splits = db.with(database: db).command(
        splitVector: chunk["ns"],
        keyPattern: key_pattern,
        min: chunk["min"],
        max: chunk["max"],
        maxChunkSize:64)

      if splits["splitKeys"].length > split_min
        splits["splitKeys"].each_with_index do |key, index|
          puts "Splitting #{ns} at #{key} (#{index+1}/#{splits["splitKeys"].length})"
          retryable(:tries => 3, :sleep => 5) do
            mongos.with(database: :admin).command(
              split: ns,
              middle: key
            )
          end
        end
      end
    rescue Moped::Errors::OperationFailure
      puts "Unable to split this one #{$!.inspect}"
    end
  end
end
