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
    items: [ 
        { xtype:'container', itemId:'selector_box', layout: { type:'hbox' }, padding: 5, margin: 5, defaults: { padding: 5 } }, 
        { xtype:'container', itemId:'chart_box', margin: 5 }
    ],
    launch: function() {
        this._addTagPicker();
        this._addZoomPicker();
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
            itemId: 'tags',
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
            fieldLabel: 'Tag:',
            labelWidth: 25,
            listeners: {
                select: function(picker,values){
                    this._findItems();
                },
                ready: function(picker) {
                    this._findItems();
                },
                scope: this
            }
        });
    },
    _addZoomPicker: function() {
        var store = Ext.create('Ext.data.Store',{
            fields: ['text','count'],
            data: [
                {text:'Monthly',count:24},
                {text:'Quarterly',count:16},
                {text:'Yearly',count:4}
            ]
        });
        this.down('#selector_box').add({
            itemId: 'zoom',
            xtype:'combobox',
            store: store,
            displayField: 'text',
            valueField: 'count',
            stateEvents: ['select'],
            stateId: 'rally.techservices.techdebt.zoom',
            stateful: true,
            fieldLabel: 'Zoom:',
            labelWidth: 30,
            listeners: {
                select: function(picker,values){
                    this._findItems();
                },
                ready: function(picker) {
                    this._findItems();
                },
                scope: this
            }
        });
    },
    _findItems: function() {
        if ( ! this.down('#tags') || ! this.down('#zoom') || this.down('#zoom').getValue() === null) {
            return;
        }
        var tag_name = this.down('#tags').getRecord().get('Name')
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
                    this._getHistory(items);
                },
                scope: this
            }
        });
    },
    _getDateArray: function(unit,count){
       this._log(["_getDateArray",unit,count]);  
       var date_array = [];
       var count_override = 1;
       var today = new Date();

       var unit_name = "minute";
       if ( unit == "Monthly" ) {
        today = new Date(today.getFullYear(),today.getMonth(), 1);
        unit_name = "month";
       }
       if ( unit == "Quarterly" ) {
        today = new Date(today.getFullYear(),today.getMonth(), 1 );
        unit_name = "month";
        count_override = 3;
       }
       if ( unit == "Yearly" ) {
        today = new Date(today.getFullYear(), 0, 1);
        unit_name = "year";
       }
       
       var multiplier = count * count_override;
       
       var day = Rally.util.DateTime.add(today,unit_name,-1*multiplier);
       while ( day <= today ) {
        date_array.push( Rally.util.DateTime.toIsoString(day) );
        day = Rally.util.DateTime.add(day,unit_name,count_override);
       }
       this._log(date_array);
       return date_array;
    },
    _getHistory: function(items) {
        this._showMask("Getting Historical Data");
        var oid_array = [];
        Ext.Array.each( items, function(item) { oid_array.push(item.get('ObjectID')); } );
        // cycle by time period
        var date_unit = this.down('#zoom').getRawValue();
        var date_count = parseInt( this.down('#zoom').getSubmitValue(), 10 );
        var date_array = this._getDateArray(date_unit,date_count);
        var current_date = date_array.shift();
        // have to break the history query because the query is a GET and the length is limited
        this._doNestedHistoryQuery(oid_array,0,current_date,date_array,{});
    },
    /* this does a double nest: cycle until we've used up the array of items to search for on a day, then start
     * over again for another day and so on until the date_array is empty
     */
    _doNestedHistoryQuery: function(oid_array,start_index,current_date,date_array,found_items) {
        this._showMask("Getting Historical Data " + current_date);
        this._log(["_doNestedHistoryQuery",start_index,current_date]);
        var gap = 200;
        var sliced_array = oid_array.slice(start_index, start_index+gap);
        if ( ! found_items[current_date] ) { found_items[current_date] = []; }
        
        var filters = [
            {"property":"ObjectID","operator":"in","value":sliced_array},
            {"property":"ScheduleState","operator":"<","value":"Completed"},
            {"property":"__At","value":current_date}
        ];
        Ext.create('Rally.data.lookback.SnapshotStore',{
            autoLoad: true,
            limit: gap,
            fetch: ['_UnformattedID','PlanEstimate','ScheduleState','CreationDate'],
            hydrate: ['ScheduleState'],
            filters: filters,
            listeners: {
                load: function(store,data,success){
                    found_items[current_date] = Ext.Array.push(found_items[current_date],data);
                    
                    start_index = start_index + gap;
                    if ( start_index < oid_array.length ) {
                        this._doNestedHistoryQuery(oid_array,start_index,current_date,date_array,found_items);
                    } else {
                        if ( date_array.length > 0 ) {
                            current_date = date_array.shift();
                            start_index = 0;
                            this._doNestedHistoryQuery(oid_array,start_index,current_date,date_array,found_items);
                        } else {
                            this._processItems(found_items);
                        }
                    }
                },
                scope: this
            }
        });
        
    },
    _processItems: function(found_items) {
        this._showMask(["Calculating Ages"]);
        this._log(found_items);
        var me = this;
        var counts = {};
        var today = new Date();
       
        var averages = [];
       
        for ( var day in found_items ) {
            if ( found_items.hasOwnProperty(day) ) {
                var age_total = 0;
                var items = found_items[day];
                me._log(items);
                Ext.Array.each( items, function(item){
                    var creation_date = Rally.util.DateTime.fromIsoString(item.get('CreationDate'));
                    var iso_day = Rally.util.DateTime.fromIsoString(day);
                    age_total += Rally.util.DateTime.getDifference(iso_day,creation_date,"day");
                });
                var age = null;
                if ( items.length > 0 ) {
                    age = Math.round( age_total / items.length );
                }
                averages.push({ day: day, age: age });
            }
        }
        
        this._makeChart(averages);
    },
    _makeChart: function(averages) {
        this._log(["_makeChart",averages]);
        this._hideMask();
        
        var me = this;
        
        var store = Ext.create('Ext.data.Store',{
            fields: ['day','age'],
            data: { rows: averages },
            proxy: { type: 'memory', reader: { type: 'json', root: 'rows' } } 
        });
        
        if ( this.chart ) { this.chart.destroy(); }
        this.chart = Ext.create('Rally.ui.chart.Chart',{
            height: 400,
            series: [{ type: 'column', dataIndex: 'age', name: 'Average Age on Date', visible: true }],
            store: store,
            chartConfig: {
                chart: {},
                title: { text: "Average Age of Unresolved Items" },
                yAxis: { title: { text: 'Age (days)' } },
                xAxis: { 
                    categories: me._getSeries(averages,'day')
                }
            }
        });
        this.down('#chart_box').add(this.chart);
    },
    _getSeries: function(hash_array,key) {
        var series_array = [];
        Ext.Array.each(hash_array, function(item){
            series_array.push( item[key].replace(/T.*$/,"") );
        });
        return series_array;
    }
});