/*
 * ObjectsReorder  - Reorder objects in Gemixer layer
 */

L.gmx.VectorLayer.addInitHook(function () {
    var max = 1000000,
        count = 0,
        layer = this,
        ObjectsReorder = function () {
            this.all = {};
            this.gmx = layer._gmx;
            this.sortFunc = null;
            layer.on('click', this.clickFunc, this);
        };

    ObjectsReorder.prototype = {
        clickFunc: function (ev) {
            var id = ev.gmx.id;
            this.addToReorder(id, ev.originalEvent.ctrlKey);
            layer.redrawItem(id);
        },

        addToReorder: function (id, botoomFlag) {
            count++;
            this.all[id] = botoomFlag ? -count : count;
        },

        getReorderArrays: function () {
            var bottom = [],
                top = [],
                arr = Object.keys(this.all).sort(function(a, b) {
                    return this.all[a] - this.all[b];
                });

            for (var i = 0, len = arr.length; i < len; i++) {
                var id = arr[i];
                if (this.all[id] > 0) {
                    top.push(id);
                } else {
                    bottom.push(id);
                }
            }
            return {top: top, bottom: bottom};
        },

        setReorderArrays: function (top, bottom) {
            this.all = {};
            count = 0;
            bottom.map(function (id) { this.addToReorder(id, true); });
            top.map(function (id) { this.addToReorder(id); });
            layer.repaint();
        },
        getSortedItems: function (arr) {
            return arr.sort(count > 0 ? this.gmx.sortItems : this.sortFunc);
        },

        setSortFunc: function (func) {
            this.sortFunc = func;
            var _this = this;
            this.gmx.sortItems = function(a, b) {
                if (count > 0) {
                    var ap = _this.all[a.id],
                        bp = _this.all[b.id];

                    if (ap || bp) {
                        ap = ap ? ap + (ap > 0 ? max : -max) : 0;
                        bp = bp ? bp + (bp > 0 ? max : -max) : 0;
                        return ap - bp;
                    }
                }
                return _this.sortFunc ? _this.sortFunc(a, b) : 0;
            };
            layer.repaint();
        }
    };

    if (!this._gmx.objectsReorder) {
        var reorder = new ObjectsReorder();
        this._gmx.objectsReorder = reorder;
        L.extend(this, {
            bringToTopItem: function (id) {
                reorder.addToReorder(id);
                layer.redrawItem(id);
            },

            bringToBottomItem: function (id) {
                reorder.addToReorder(id, true);
                layer.redrawItem(id);
            },

            getReorderArrays: reorder.getReorderArrays,
            setReorderArrays: reorder.setReorderArrays,
            setSortFunc: reorder.setSortFunc
        });
    }
});
