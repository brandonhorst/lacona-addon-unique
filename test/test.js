var chai = require('chai');
var stream = require('stream');

var lacona = require('lacona');
var Stateful = require('lacona-addon-stateful');
var Ordered = require('lacona-addon-ordered');
var fulltext = require('lacona-util-fulltext');

var Unique = require('..');

var expect = chai.expect;

function toStream(strings) {
  var newStream = new stream.Readable({objectMode: true});

  strings.forEach(function (string) {
    newStream.push(string);
  });
  newStream.push(null);

  return newStream;
}

function toArray(done) {
  var newStream = new stream.Writable({objectMode: true});
  var list = [];
  newStream.write = function(obj) {
    list.push(obj);
  };

  newStream.end = function() {
    done(list);
  };

  return newStream;
}


describe('lacona-addon-unique', function () {
  var parser, stateful, ordered, unique;


  beforeEach(function () {
    parser = new lacona.Parser();
    stateful = new Stateful({serializer: fulltext.all});
    ordered = new Ordered({comparator: fulltext.all});
    unique = new Unique({serializer: fulltext.suggestion});
  });

  describe('basic usage', function () {
    var test;

    beforeEach(function () {
      test = lacona.createPhrase({
        name: 'test/test',
        describe: function () {
          return lacona.sequence({children: [
            lacona.literal({text: 'test'}),
            lacona.choice({children: [
              lacona.literal({text: 'aaa'}),
              lacona.literal({text: 'bbb'})
            ]})
          ]});
        }
      });

      parser.sentences = [test()];
    });

    it('uniquifies updates within a single suggestion' , function (done) {
      function callback(data) {
        expect(data).to.have.length(2);
        expect(data[0].event).to.equal('insert');
        expect(fulltext.suggestion(data[0].data)).to.equal('test');
        expect(fulltext.completion(data[0].data)).to.equal('aaa');

        expect(data[1].event).to.equal('update');
        expect(fulltext.suggestion(data[1].data)).to.equal('test');
        expect(fulltext.completion(data[1].data)).to.equal('aaa');

        done();
      }

      toStream(['t', 'te'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(toArray(callback));
    });

    it('uniquifies updates when changing the suggestion' , function (done) {
      function callback(data) {
        expect(data).to.have.length(3);

        expect(data[0].id).to.equal(0);
        expect(data[0].event).to.equal('insert');
        expect(fulltext.match(data[0].data)).to.equal('test');
        expect(fulltext.suggestion(data[0].data)).to.equal('bbb');

        expect(data[1].event).to.equal('insert');
        expect(data[1].id).to.equal(0);
        expect(fulltext.suggestion(data[1].data)).to.equal('test');
        expect(fulltext.completion(data[1].data)).to.equal('aaa');

        expect(data[2].event).to.equal('delete');
        expect(data[2].id).to.equal(1);

        done();
      }

      toStream(['testb', 'tes'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(toArray(callback));
    });

    it('removes uniqueness check when suggestion changes' , function (done) {
      function callback(data) {
        expect(data).to.have.length(4);

        expect(data[0].id).to.equal(0);
        expect(data[0].event).to.equal('insert');
        expect(fulltext.suggestion(data[0].data)).to.equal('test');
        expect(fulltext.completion(data[0].data)).to.equal('aaa');

        expect(data[1].event).to.equal('update');
        expect(data[1].id).to.equal(0);
        expect(fulltext.match(data[1].data)).to.equal('test');
        expect(fulltext.suggestion(data[1].data)).to.equal('aaa');

        expect(data[2].event).to.equal('insert');
        expect(data[2].id).to.equal(1);
        expect(fulltext.suggestion(data[2].data)).to.equal('test');
        expect(fulltext.completion(data[2].data)).to.equal('bbb');

        expect(data[3].event).to.equal('update');
        expect(data[3].id).to.equal(1);
        expect(fulltext.match(data[3].data)).to.equal('test');
        expect(fulltext.suggestion(data[3].data)).to.equal('bbb');

        done();
      }

      toStream(['tes','test'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(toArray(callback));
    });

    it('handles delete switches appropriately' , function (done) {
      function callback(data) {
        expect(data).to.have.length(4);

        expect(data[0].event).to.equal('insert');
        expect(data[0].id).to.equal(0);
        expect(fulltext.match(data[0].data)).to.equal('test');
        expect(fulltext.suggestion(data[0].data)).to.equal('aaa');

        expect(data[1].event).to.equal('insert');
        expect(data[1].id).to.equal(1);
        expect(fulltext.match(data[1].data)).to.equal('test');
        expect(fulltext.suggestion(data[1].data)).to.equal('bbb');

        expect(data[2].event).to.equal('update');
        expect(data[2].id).to.equal(1);
        expect(fulltext.match(data[2].data)).to.equal('test');
        expect(fulltext.suggestion(data[2].data)).to.equal('bbb');

        expect(data[3].event).to.equal('delete');
        expect(data[3].id).to.equal(0);

        done();
      }

      toStream(['test','testb'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(toArray(callback));
    });

    it('handles delete ignores appropriately' , function (done) {
      function callback(data) {
        expect(data).to.have.length(4);

        expect(data[1].event).to.equal('update');
        expect(data[1].id).to.equal(0);
        expect(fulltext.match(data[1].data)).to.equal('test');
        expect(fulltext.suggestion(data[1].data)).to.equal('aaa');

        expect(data[2].event).to.equal('insert');
        expect(data[2].id).to.equal(1);
        expect(fulltext.suggestion(data[2].data)).to.equal('test');
        expect(fulltext.completion(data[2].data)).to.equal('bbb');

        expect(data[3].event).to.equal('delete');
        expect(data[3].id).to.equal(1);

        done();
      }

      toStream(['tes','testa'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(toArray(callback));
    });
  });

  describe('reverse order', function () {
    var test;
    beforeEach(function () {
      test = lacona.createPhrase({
        name: 'test/test',
        describe: function () {
          return lacona.sequence({children: [
            lacona.literal({text: 'test'}),
            lacona.choice({children: [
              lacona.literal({text: 'bbb'}),
              lacona.literal({text: 'aaa'})
            ]})
          ]});
        }
      });

      parser.sentences = [test()];
    });

    it('allows for inserts into an existing unique group', function (done) {
      function callback(data) {
        expect(data).to.have.length(3);

        expect(data[0].event).to.equal('insert');
        expect(data[0].id).to.equal(0);
        expect(fulltext.suggestion(data[0].data)).to.equal('test');
        expect(fulltext.completion(data[0].data)).to.equal('bbb');

        expect(data[1].event).to.equal('delete');
        expect(data[1].id).to.equal(0);

        expect(data[2].event).to.equal('insert');
        expect(data[2].id).to.equal(0);
        expect(fulltext.suggestion(data[2].data)).to.equal('test');
        expect(fulltext.completion(data[2].data)).to.equal('aaa');

        done();
      }

      toStream(['t'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(toArray(callback));
    });

    it('removes items from an existing unique group', function (done) {
      function callback(data) {
        expect(data).to.have.length(5);

        expect(data[3].event).to.equal('insert');
        expect(data[3].id).to.equal(1);
        expect(fulltext.match(data[3].data)).to.equal('test');
        expect(fulltext.suggestion(data[3].data)).to.equal('bbb');

        expect(data[4].event).to.equal('delete');
        expect(data[4].id).to.equal(0);

        done();
      }

      toStream(['t', 'testb'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(toArray(callback));

    });

    it('removes items from an vanishing unique group', function (done) {
      function callback(data) {
        expect(data).to.have.length(5);

        expect(data[2].event).to.equal('update');
        expect(data[2].id).to.equal(1);
        expect(fulltext.suggestion(data[2].data)).to.equal('test');
        expect(fulltext.completion(data[2].data)).to.equal('bbb');

        expect(data[3].event).to.equal('delete');
        expect(data[3].id).to.equal(1);

        expect(data[4].event).to.equal('update');
        expect(data[4].id).to.equal(0);
        expect(fulltext.suggestion(data[4].data)).to.equal('test');
        expect(fulltext.completion(data[4].data)).to.equal('aaa');

        done();
      }

      toStream(['test', 'tes'])
        .pipe(parser)
        .pipe(stateful)
        .pipe(ordered)
        .pipe(unique)
        .pipe(toArray(callback));

    });
  });
});
