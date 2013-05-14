/*
 * 
 *  Notes:  
 *       1. This app will first get the items that _currently have the tag__ and then goes to look for
 *       history.  This means that you can add a tag to something today to see its state yesterday.  It
 *       also means that you don't see how designations change over time.
 *       
 */
 Ext.define('TagDistributionApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    version: 0.1,
    items: [ 
        { xtype:'container', itemId:'selector_box', layout: { type:'hbox' }, padding: 5, margin: 5, defaults: { padding: 5 } }, 
        { xtype:'container', itemId:'chart_box', margin: 5 }
    ],
    launch: function() {
        this._preLoadLeafProjects();
//        this._addTagPicker();
//        this._addZoomPicker();
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
    _preLoadLeafProjects: function() {
        // Snapshots only give the ObjectID of projects, not the actual names
        this._showMask("Preloading Team Names");
        var me = this;
        this.projects = {};
        var project_holder = {};
              
        // Only true inside Rally
        var projects_in_scope = "__PROJECT_OIDS_IN_SCOPE__".split(',');
        
        var store = Ext.create('Rally.data.WsapiDataStore',{
            model: 'Project',
            autoLoad: true,
            limit: Infinity,
            fetch: ['ObjectID','Name','Children'],
            sorters: [{"property":"Name"}],
            listeners: {
                load: function(store,data,success,opts){
                    Ext.Array.each(data, function(item){
                        if ( item.get('Children').length == 0 ) {
                            project_holder[item.get('ObjectID')] = item.get('Name') ;
                        }
                    });
                    // check to see if we're outside Rally
                    if ( projects_in_scope && projects_in_scope.length > 0 && projects_in_scope[0] !== "__PROJECT_OIDS_IN_SCOPE__" ) {
                        Ext.Array.each( projects_in_scope, function(project) {
                            if ( project_holder[project] ) {
                                me.projects[project] = project_holder[project];
                            }
                        });
                    } else {
                        me.projects = project_holder;
                    }
        
                    me._addTagPicker();
                    me._addZoomPicker();
                },
                scope: this
            }
        }); 
    },
    _addTagPicker: function() {
        this.down('#selector_box').add({
            itemId: 'tags',
            xtype:'rallycombobox',
            storeConfig: { 
                autoLoad: true,
                typeAhead: true,
                limit: 'Infinity',
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
    /* this one responds to the project scoping */
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
        // to get the end of a quarter, go the the first day of the next quarter
        // then go back a day (because it's harder to guess whether a month will end on 30 or 31)
        // So the first day of this quarter is :
        var beginning_of_quarter = new Date( today.getFullYear(), Math.floor( today.getMonth() / 3 ) * 3, 1 );
        
        today = beginning_of_quarter;
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
        var date_to_push = day;
        if ( unit == "Quarterly" ) {
            // Go back a day because we don't have this quarter's info yet:
            date_to_push = Rally.util.DateTime.add(day,"day",-1);
        }
        date_array.push( Rally.util.DateTime.toIsoString(date_to_push) );
        day = Rally.util.DateTime.add(day,unit_name,count_override);
       }
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
            {"property":"ScheduleState","operator":">=","value":"Completed"},
            {"property":"__At","value":current_date}
        ];
        Ext.create('Rally.data.lookback.SnapshotStore',{
            autoLoad: true,
            limit: gap,
            fetch: ['_UnformattedID','PlanEstimate','CreationDate','Project'],
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
        this._showMask(["Counting Items in Each Team"]);
        var me = this;
        var counts = {};
        var today = new Date();
       
        var processed_data = [];
        var max_count = 0;
        var max_age = 0;
       
        for ( var day in found_items ) {
            if ( found_items.hasOwnProperty(day) ) {
                var items = found_items[day];
                
                var counts = { "day": day };
                for ( var i in me.projects ) {
                    if ( me.projects.hasOwnProperty(i) ) {
                        counts[ me.projects[i] ] = 0;
                    }
                }
                
                Ext.Array.each( items, function(item){
                    counts[ me.projects[item.get('Project')] ]++;
                });
                
                if (items.length > max_count ) { max_count = items.length };
                processed_data.push(counts);
            }
        }
        
        this._makeChart(processed_data,max_count);
    },
    _makeChart: function(processed_data,max_count) {
        this._log(["_makeChart",processed_data]);
        this._hideMask();
        
        var me = this;
        
        if ( processed_data.length > 0 ) {
            var fields = [];
            for ( var i in processed_data[0] ) {
                if ( processed_data[0].hasOwnProperty(i)  ) {
                    fields.push(i);
                }
            }
            this._log(["Fields",fields]);
            var store = Ext.create('Ext.data.Store',{
                fields: fields,
                data: { rows: processed_data },
                proxy: { type: 'memory', reader: { type: 'json', root: 'rows' } } 
            });
            
            if ( this.chart ) { this.chart.destroy(); }
            this.chart = Ext.create('Rally.ui.chart.Chart',{
                height: 400,
                series: me._getSeries(processed_data[0]),
                store: store,
                chartConfig: {
                    chart: { zoomType: 'xy' },
                    title: { text: "Resolved Items by Team" },
                    plotOptions:{ area: { stacking: "normal" } },
                    yAxis: [ 
                        { title: { text: 'Count' }, min: 0 }
                    ],
                    xAxis: { 
                        categories: me._getCategories(processed_data,'day')
                    }
                }
            });
            this.down('#chart_box').add(this.chart);
        }
    },
    _getSeries: function(series_hash) {
        var series_set = [];
        for ( var i in series_hash ) {
            if ( series_hash.hasOwnProperty(i) && i !== "day" ) {
                series_set.push({ type: 'area', dataIndex: i, name: i, visible: true, stack: 0 });
            }
        }
        return series_set;
    },
    _getCategories: function(hash_array,key) {
        var category_array = [];
        Ext.Array.each(hash_array, function(item){
            category_array.push( item[key].replace(/T.*$/,"") );
        });
        return category_array;
    }
});
