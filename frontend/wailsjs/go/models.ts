export namespace main {
	
	export class DraftInfo {
	    for: string;
	    name: string;
	    content: string;
	    t: number;
	
	    static createFrom(source: any = {}) {
	        return new DraftInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.for = source["for"];
	        this.name = source["name"];
	        this.content = source["content"];
	        this.t = source["t"];
	    }
	}
	export class ExternalPlugin {
	    id: string;
	    manifest: Record<string, any>;
	    hasMain: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExternalPlugin(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.manifest = source["manifest"];
	        this.hasMain = source["hasMain"];
	    }
	}

}

