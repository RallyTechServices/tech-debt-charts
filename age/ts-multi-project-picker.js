/*
 * A picker which allows multiple objects.  When the objects have Children,
 * the picker constructs a tree
 */
 
Ext.define('Rally.ts.MultiProjectPicker', {
    extend: 'Rally.ui.picker.MultiObjectPicker',
    alias: 'widget.rallytsmultiprojectpicker',
    config: {
        storeConfig: {
            fetch: ['Name','ObjectID','Parent','Children','State']
        },
        preselected: []    
    },
    constructor: function(config) {
        this.mergeConfig(config); 
        this.callParent([this.config]);   
    },
    _reorder: function(store,data) {
        var me = this;
        var project_hash = {};
        Ext.Array.each(data,function(datum){
            project_hash[datum.get('ObjectID')] = datum;
        });
        var ordered_array = [];
        // top stuff first
        Ext.Array.each( data, function(datum){
            if (! datum.get('Parent') ) {
                ordered_array.push(datum);
                Ext.Array.push( ordered_array,me._getChildren(datum,project_hash,"") );
            }
        });
        
        store.removeAll();
        store.add(ordered_array);
        // set selections
        var preselected_objects = [];
        if ( me.preselected.length > 0 ) {
            Ext.Array.each( ordered_array, function(item) {
                if ( Ext.Array.indexOf(me.preselected, item.get('_refObjectName')) > -1) {
                    preselected_objects.push(item.getData());
                }
            });
        }
        this.setValue(preselected_objects);
    },
    _getChildren: function(item,hash,prefix){
        var me = this;
        var ordered_array = [];
        prefix += "-";
        
        if ( item.get('Children') && item.get('Children').length > 0 ) {
            Ext.Array.each( item.get('Children'), function(child) {
                var real_child = hash[child.ObjectID];
                
                if ( real_child ) {
                    real_child.set('Name',prefix + real_child.get('Name'));
                    ordered_array.push(real_child);
                    Ext.Array.push( ordered_array, me._getChildren(real_child,hash,prefix));
                }
            });
        }
        return ordered_array;
    },
    createStore: function() {
        var me = this;
        var storeCreator = Ext.create('Rally.data.DataStoreCreator', {
            modelType: this.modelType,
            storeConfig: this.storeConfig
        });
        this.mon(storeCreator, 'storecreate', function(store) {
            me.mon(store,'load',me._reorder, me, {single: true} );
            this.store = store;
            this.expand();
            this.collapse();
        }, this, {single: true});
        storeCreator.createStore();
    },
    _createStoreAndExpand: function() {
        var me = this;
        var storeCreator = Ext.create('Rally.data.DataStoreCreator', {
            modelType: this.modelType,
            storeConfig: this.storeConfig
        });
        this.mon(storeCreator, 'storecreate', function(store) {
            me.mon(store,'load',me._reorder, me, {single: true} );
        }, this, {single: true});
        this.mon(storeCreator, 'storecreate', function(store) {
            this.store = store;
            this.expand();
        }, this, {single: true});
        storeCreator.createStore();
    }
});