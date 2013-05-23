/*
 *  (c) 2013 Rally Software Development Corp.  All Rights Reserved.
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
    version: 0.5,
    items: [ 
        { xtype:'container', itemId:'selector_box', layout: { type:'hbox' }, padding: 5, margin: 5, defaults: { padding: 5 } }, 
        { xtype:'container', itemId:'chart_box', margin: 5 }
    ],
    launch: function() {
        this._addTagPicker();
        this._addZoomPicker();
        this._addExcludedProjectPicker();
        this._addButton();
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
    _enableButton: function() {
        if ( this.down('#go_button') ) {
            if ( ! this.down('#tags') || ! this.down('#zoom') || this.down('#zoom').getValue() === null) {
                return;
            }
            this.down('#go_button').setDisabled(false);
        }
    },
    _addButton: function() {
        var me = this;
        this.down('#selector_box').add({
            itemId: 'go_button',
            xtype: 'rallybutton',
            text: 'Go',
            disabled: true,
            margin: 3,
            handler: function() {
                me._doTaggedStoryQuery();
            }
        }); 
        this._enableButton();
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
                    this._enableButton();
                },
                ready: function(picker) {
                    this._enableButton();
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
                    this._enableButton();
                },
                ready: function(picker) {
                    this._enableButton();
                },
                scope: this
            }
        });
    },
    _addExcludedProjectPicker: function() {
        this.down('#selector_box').add({
            itemId: 'excluded_projects',
            xtype: 'rallytsmultiprojectpicker',
            modelType: 'project',
            stateEvents: ['selectionchange','select','blur'],
            stateId: 'rally.techservices.techdebt.project',
            stateful: true,
            labelWidth: 95,
            preselected: ["Cancelled"],
            width: 375,
            fieldLabel: 'Excluded Projects:',
            listeners: {
                afterrender: function(picker) {
                    this._log('aferrender');
                    picker.createStore();
                },
                scope: this
            }
        });  
    },
    _doTaggedStoryQuery: function() {
        var tag_name = this.down('#tags').getRecord().get('Name')
        // first, find all the items with the tag.  Use WSAPI so that we don't have
        // a permissions issue later.
        this._showMask("Finding Stories with tag " + tag_name);
        var items = [];
        // Data before 11/2011 is unreliable, so try to remove as many
        // items as possible
        var tag_filter = Ext.create('Rally.data.QueryFilter', { 
            property: 'Tags.Name',
            operator: 'contains',
            value: tag_name
        });
        var not_accepted_too_early_filter = Ext.create('Rally.data.QueryFilter', { 
            property: 'AcceptedDate',
            operator: '>',
            value: "2011-11-01"
        }).or(Ext.create('Rally.data.QueryFilter', { 
            property: 'AcceptedDate',
            operator: '=',
            value: null
        }));
        var filters = tag_filter.and(not_accepted_too_early_filter);
        
        Ext.create('Rally.data.WsapiDataStore',{
            model: 'User Story',
            autoLoad: true,
            limit: Infinity,
            context: { "project": null },
            filters: filters,
            fetch: ['ObjectID','ScheduleState','Project'],
            listeners: {
                load: function(store,data,success){
                    items = data;
                    this._doTaggedDefectQuery(tag_name,items);
                },
                scope: this
            }
        });
    },
    _doTaggedDefectQuery: function(tag_name,items){
        this._showMask("Finding Defects with tag " + tag_name);
        var tag_filter = Ext.create('Rally.data.QueryFilter', { 
            property: 'Tags.Name',
            operator: 'contains',
            value: tag_name
        });
        var not_accepted_too_early_filter = Ext.create('Rally.data.QueryFilter', { 
            property: 'AcceptedDate',
            operator: '>',
            value: "2011-11-01"
        }).or(Ext.create('Rally.data.QueryFilter', { 
            property: 'AcceptedDate',
            operator: '=',
            value: null
        }));
        var filters = tag_filter.and(not_accepted_too_early_filter);
        
        Ext.create('Rally.data.WsapiDataStore',{
            model: 'Defect',
            autoLoad: true,
            limit: Infinity,
            context: { "project": null },
            filters: filters,
            fetch: ['ObjectID','ScheduleState','Project'],
            listeners: {
                load: function(store,data,success){
                    items = Ext.Array.push(items,data);
                    this._log("Number of Tagged Items:"+items.length);
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
       date_array.push( Rally.util.DateTime.toIsoString( new Date() ));
       this._log(date_array);
       return date_array;
    },
    _removeExcludedProjects: function(items) {
        this._log( "_removeExcludedProjects" );
        var me = this;
        var excluded_projects = this.down('#excluded_projects').getValue();
        if ( excluded_projects.length === 0 ) { 
            this._log("No excluded projects");
            return items;
        }
        this._log(["Exclude: ", excluded_projects ]);
        var oids = [];
        Ext.Array.each(excluded_projects, function(project) {
            oids.push(project.ObjectID);
        });
        var cleaned_items = [];
        Ext.Array.each(items,function(item){
            if ( Ext.Array.indexOf( oids, parseInt(item.get('Project').ObjectID,10) ) === -1 ) {
                cleaned_items.push( item );
            } 
        });
        return cleaned_items;
    },
    _getHistory: function(items) {
        this._showMask("Getting Historical Data");
        var oid_array = [];
        this.original_oids = oid_array;
        items = this._removeExcludedProjects(items);
        
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
        var gap = 250;
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
        this._log(["_processItems",found_items]);
        var me = this;
        var counts = {};
        var today = new Date();
       
        var processed_data = [];
        var max_count = 0;
        var max_age = 0;
       
        this._log( "Original: " + this.original_oids.length);
        for ( var day in found_items ) {
            if ( found_items.hasOwnProperty(day) ) {                
                var age_total = 0;
                var items = found_items[day];
                me._log("On day " + day + " found " + items.length + " items");
                Ext.Array.each( items, function(item){
                    var creation_date = Rally.util.DateTime.fromIsoString(item.get('CreationDate'));
                    var iso_day = Rally.util.DateTime.fromIsoString(day);
                    age_total += Rally.util.DateTime.getDifference(iso_day,creation_date,"day");
                    
                });
                var age = null;
                if ( items.length > 0 ) {
                    age = Math.round( age_total / items.length );
                    if ( age > max_age ) { max_age = age; }
                }
                
                if (items.length > max_count ) { max_count = items.length };
                processed_data.push({ day: day, age: age, count: items.length, final_day_age: null, final_day_count: null });
                       
            }
        }
        
        // move last day's data over to the right
        var last_age = processed_data[ processed_data.length - 1 ].age;
        processed_data[processed_data.length-1].final_day_age = last_age;
        processed_data[processed_data.length-1].age = null;
        
        this._makeChart(processed_data,max_age,max_count);
    },
    _makeChart: function(processed_data,max_age,max_count) {
        this._log(["_makeChart",processed_data]);
        this._hideMask();
        
        var me = this;
        
        var store = Ext.create('Ext.data.Store',{
            fields: ['day','age'],
            data: { rows: processed_data },
            proxy: { type: 'memory', reader: { type: 'json', root: 'rows' } } 
        });
        
        if ( this.chart ) { this.chart.destroy(); }
        this.chart = Ext.create('Rally.ui.chart.Chart',{
            height: 400,
            series: [
                { type: 'column', dataIndex: 'age', name: 'Average Age of Unresolved Items on Date', yAxis: 0, visible: true },
                { type: 'column', dataIndex: 'final_day_age', name: 'Average Age of Unresolved Items Today', yAxis: 0, visible: true },
                { type: 'line', dataIndex: 'count', name: 'Number of Unresolved Items on Date', yAxis: 1, visible: true } ],
            store: store,
            chartConfig: {
                chart: { zoomType: 'y' },
                title: { text: "Average Age of Unresolved Items" },
                yAxis: [ 
                    { title: { text: 'Age (days)' }, max: max_age },
                    { title: { text: 'Count' }, opposite: true, min: 0, max: max_count  }
                ],
                xAxis: { 
                    categories: me._getSeries(processed_data,'day')
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
