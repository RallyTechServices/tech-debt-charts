/*
 * 
 *  Notes:  
 *       1. This app will first get the items that _currently have the tag__ and then goes to look for
 *       history.  This means that you can add a tag to something today to see its state yesterday.  It
 *       also means that you don't see how designations change over time.
 *       
 */
 Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    version: 0.1,
    items: [ { xtype:'container', itemId:'selector_box', margin: 5 }],
    launch: function() {
        this._addTagPicker();
    },
    _log: function(msg) {
        window.console && console.log(msg);
    },
    _showMask: function(msg) {
        if ( this.getEl() ) { 
            this.getEl().unmask();
            this.getEl().mask(msg);
        }
    },
    _hideMask: function() {
        this.getEl().unmask();
    },
    _addTagPicker: function() {
        this.down('#selector_box').add({
            xtype:'rallycombobox',
            storeConfig: { 
                autoLoad: true,
                typeAhead: true,
                model: 'Tag', 
                sorters: [{property:'Name'}]
            },
            stateEvents: ['select'],
            stateId: 'rally.techservices.techdebt.tag',
            stateful: true,
            listeners: {
                select: function(picker,values){
                    this._findItems(values[0].get('Name'));
                },
                ready: function(picker) {
                    this._findItems(picker.getRecord().get('Name'));
                },
                scope: this
            }
        });
    },
    _findItems: function(tag_name) {
        // first, find all the items with the tag.  Use WSAPI so that we don't have
        // a permissions issue later
        this._showMask("Finding Stories with tag " + tag_name);
        var items = [];
        Ext.create('Rally.data.WsapiDataStore',{
            model: 'User Story',
            autoLoad: true,
            limit: Infinity,
            context: { "project": null },
            filters: [{"property":"Tags.Name","operator":"contains","value":tag_name}],
            fetch: ['ObjectID','ScheduleState'],
            listeners: {
                load: function(store,data,success){
                    items = data;
                    this._log(data);
                    this._findDefects(tag_name,items);
                },
                scope: this
            }
        });
    },
    _findDefects: function(tag_name,items){
        this._showMask("Finding Defects with tag " + tag_name);
        Ext.create('Rally.data.WsapiDataStore',{
            model: 'Defect',
            autoLoad: true,
            limit: Infinity,
            context: { "project": null },
            filters: [{"property":"Tags.Name","operator":"contains","value":tag_name}],
            fetch: ['ObjectID','ScheduleState'],
            listeners: {
                load: function(store,data,success){
                    items = Ext.Array.push(items,data);
                    this._log(data);
                    this._log(items);
                    this._getHistory(tag_name,items);
                },
                scope: this
            }
        });
    },
    _getHistory: function(tag_name,items) {
        this._showMask("Getting Historical Data");
        var oid_array = [];
        Ext.Array.each( items, function(item) { oid_array.push(item.get('ObjectID')); } );
        // have to break the history query because the query is a GET and the length is limited
        this._doNestedHistoryQuery(tag_name,oid_array,0,[]);
    },
    _doNestedHistoryQuery: function(tag_name,oid_array,start_index,found_items) {
        this._log(["_doNestedHistoryQuery",start_index]);
        var gap = 200;
        var sliced_array = oid_array.slice(start_index, start_index+gap);
        
        var filters = [
            {"property":"ObjectID","operator":"in","value":sliced_array},
            {"property":"ScheduleState","operator":"<","value":"Completed"},
            {"property":"__At","value":"current"}
        ];
        Ext.create('Rally.data.lookback.SnapshotStore',{
            autoLoad: true,
            limit: gap,
            fetch: ['_UnformattedID','PlanEstimate','ScheduleState','CreationDate'],
            hydrate: ['ScheduleState'],
            filters: filters,
            listeners: {
                load: function(store,data,success){
                    found_items = Ext.Array.push(found_items,data);
                    
                    start_index = start_index + gap;
                    if ( start_index < oid_array.length ) {
                        this._doNestedHistoryQuery(tag_name,oid_array,start_index,found_items);
                    } else {
                        this._processItems(tag_name,found_items);
                    }
                },
                scope: this
            }
        });
        
    },
    _processItems: function(tag_name,items) {
        this._showMask("Calculating Ages");
        var me = this;
        var counts = {};
        var today = new Date();
        
        var age_total = 0;
        Ext.Array.each( items, function(item){
            var state = item.get('ScheduleState');
            if ( !counts[state] ) { counts[state]=0; }
            counts[state]++;
            
            var creation_date = Rally.util.DateTime.fromIsoString(item.get('CreationDate'));
            me._log( [item.get('_UnformattedID'), today, creation_date, Rally.util.DateTime.getDifference(today,creation_date,"day")] );
            age_total += Rally.util.DateTime.getDifference(today,creation_date,"day");
        });
        
        this._log(counts);
        var average = 0;
        if ( items.length > 0 ) {
            average = age_total / items.length ;
        }
        
        
        this._log(Math.round(average));
        
        
    }
});
