use config

// dbName: Set this to the database name
// collection: Set this to the collection you want to merge chunks in
// keyPattern: Set this to the key pattern, ie { "_id" : "hashed" }
// sleepValue: How long to sleep between each chunk (for backoff)
mergeChunks = function(dbName, collection, keyPattern, sleepValue) {
  ns = dbName + "." + collection

  checkChunkForMerge = function(chunk) {
    hasDocs = chunkHasDocs(chunk)

    if(hasDocs) {
      // Not an empty chunk
      print("Count is non-zero!")
      return
    }

    print("Running datasize")
    dataSize = db.getSiblingDB(dbName).runCommand({
      "dataSize": chunk.ns,
      "keyPattern": keyPattern,
      "min": chunk.min,
      "max": chunk.max
    })

    print("DataSize of " + dataSize.size + " and took " + dataSize.millis + "ms")

    // Found an empty chunk
    if(dataSize.size != 0) {
      // Not an empty chunk
      return
    }

    // Lets try and find a colocated chunk to merge with
    mergableRange = null
    prevChunk = db.chunks.findOne({ns: ns, "max": chunk.min})
    nextChunk = null
    if(prevChunk && prevChunk.shard == chunk.shard) {
      mergableRange = [prevChunk.min, chunk.max]
    } else {
      nextChunk = db.chunks.findOne({ns: ns, "min": chunk.max})
      if(nextChunk && nextChunk.shard == chunk.shard) {
        mergableRange = [chunk.min, nextChunk.max]
      }
    }

    // If we cant we have to move the empty chunk
    if(mergableRange == null) {
      dest = null
      if(prevChunk) {
        dest = prevChunk.shard;
        mergableRange = [prevChunk.min, chunk.max]
      } else if(nextChunk) {
        dest = nextChunk.shard;
        mergableRange = [chunk.min, nextChunk.max]
      } else {
        print("Unable to move empty chunk to mergeable range")
        return
      }
      print("Moving chunk to " + dest)
      printjson(chunk)

      db.getSiblingDB('admin').runCommand({
        moveChunk : chunk.ns,
        bounds : [chunk.min, chunk.max],
        to : dest,
        _secondaryThrottle : true,
        _waitForDelete : true
      })
      chunk.shard = dest
    }

    // Lets try the merge
    if(mergableRange) {
      print("Merging a chunk on " + chunk.shard)

      db.getSiblingDB('admin').runCommand({
        mergeChunks: chunk.ns,
        bounds: mergableRange
      })
    } else {
      print("Unable to merge with another chunk!")
    }
  }

  chunkHasDocs = function(chunk) {
    query = {}
    shardKeys = Object.keys(keyPattern)
    if (shardKeys.length > 1) {
      firstKey = shardKeys[0]
      secondKey = shardKeys[1]

      if (chunk.min[firstKey].toString() == chunk.max[firstKey].toString()) {
        query[firstKey] = chunk.min[firstKey]
        query[secondKey] = {$gte: chunk.min[secondKey], $lt: chunk.max[secondKey]}
      } else {
        lowerRange = {}
        lowerRange[firstKey] = chunk.min[firstKey]
        lowerRange[secondKey] = {$gte: chunk.min[secondKey]}

        midRange = {}
        midRange[firstKey] = {$gt: chunk.min[firstKey] , $lt: chunk.max[firstKey]}

        upperRange = {}
        upperRange[firstKey] = chunk.max[firstKey]
        upperRange[secondKey] = {$lt: chunk.max[secondKey]}

        query.$or = [
          lowerRange,
          midRange,
          upperRange
        ]
      }
    } else {
      shardKey = shardKeys[0]

      // If its hashed then we cant do the count :-(
      if (keyPattern[shardKey] == "hashed") return 0
      query[shardKey] = {$gte: chunk.min[shardKey], $lt: chunk.max[shardKey]}
    }

    print("Running count")
    printjson(query)
    return db.getSiblingDB(dbName)[collection].find(query, {"_id": 1}).readPref("secondary").limit(1).maxTimeMS(10000).hasNext()
  }

  print("Loading cursor to iterate through chunks...")
  cursor = db.chunks.find({ns: ns}).sort({"max": 1}).addOption(DBQuery.Option.noTimeout)
  print("Done!")

  docsProcessed = 0
  cursor.forEach(function(chunk){
    checkChunkForMerge(chunk)
    docsProcessed = docsProcessed + 1
    print("Processed " + docsProcessed + " documents!")
    if(sleepValue) {
      print("Sleeping...")
      sleep(sleepValue)
    }
  })
}
