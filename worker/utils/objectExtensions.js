module.exports = {
  defineAutoProperty: function(o, key, initialValue) {
      Object.defineProperty(o, 'startPageId', {
          value: initialValue,
          writable: true,
          enumerable: true
      });
  }
};