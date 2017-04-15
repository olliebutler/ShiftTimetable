const React = require('react');
const ReactDOM = require('react-dom')
const client = require('./client');
const follow = require('./follow');
const when = require('when');

var root = '/api';

class App extends React.Component {

	constructor(props) {
		super(props);
		this.state = {shifts: [], attributes: [], pageSize: 2, links: {}};
		this.updatePageSize = this.updatePageSize.bind(this);
		this.onCreate = this.onCreate.bind(this);
		this.onUpdate = this.onUpdate.bind(this);
		this.onDelete = this.onDelete.bind(this);
		this.onNavigate = this.onNavigate.bind(this);
	}
	
	
	loadFromServer(pageSize) {
		follow(client, root, [
			{rel: 'shifts', params: {size: pageSize}}]
		).then(shiftCollection => {
			return client({
				method: 'GET',
				path: shiftCollection.entity._links.profile.href,
				headers: {'Accept': 'application/schema+json'}
			}).then(schema => {
				this.schema = schema.entity;
				this.links = shiftCollection.entity._links;
				return shiftCollection;
			});
		}).then(shiftCollection => {
			return shiftCollection.entity._embedded.shifts.map(shift =>
					client({
						method: 'GET',
						path: shift._links.self.href
					})
			);
		}).then(shiftPromises => {
			return when.all(shiftPromises);
		}).done(shifts => {
			this.setState({
				shifts: shifts,
				attributes: Object.keys(this.schema.properties),
				pageSize: pageSize,
				links: this.links
			});
		});
	}
	
	onCreate(newShift) {
		var self = this;
		follow(client, root, ['shifts']).then(response => {
			return client({
				method: 'POST',
				path: response.entity._links.self.href,
				entity: newShift,
				headers: {'Content-Type': 'application/json'}
			})
		}).then(response => {
			return follow(client, root, [{rel: 'shifts', params: {'size': self.state.pageSize}}]);
		}).done(response => {
			if (typeof response.entity._links.last != "undefined") {
				this.onNavigate(response.entity._links.last.href);
			} else {
				this.onNavigate(response.entity._links.self.href);
			}
		});
	}
	
	onUpdate(shift, updatedShift) {
		client({
			method: 'PUT',
			path: shift.entity._links.self.href,
			entity: updatedShift,
			headers: {
				'Content-Type': 'application/json',
				'If-Match': shift.headers.Etag
			}
		}).done(response => {
			this.loadFromServer(this.state.pageSize);
		}, response => {
			if (response.status.code === 412) {
				alert('DENIED: Unable to update ' +
					shift.entity._links.self.href + '. Your copy is stale.');
			}
		});
	}
	
	onDelete(shift) {
		client({method: 'DELETE', path: shift.entity._links.self.href}).done(response => {
			this.loadFromServer(this.state.pageSize);
		});
	}
	
	onNavigate(navUri) {
		client({
			method: 'GET',
			path: navUri
		}).then(shiftCollection => {
			this.links = shiftCollection.entity._links;

			return shiftCollection.entity._embedded.shifts.map(shift =>
					client({
						method: 'GET',
						path: shift._links.self.href
					})
			);
		}).then(shiftPromises => {
			return when.all(shiftPromises);
		}).done(shifts => {
			this.setState({
				shifts: shifts,
				attributes: Object.keys(this.schema.properties),
				pageSize: this.state.pageSize,
				links: this.links
			});
		});
	}
	
	updatePageSize(pageSize) {
		if (pageSize !== this.state.pageSize) {
			this.loadFromServer(pageSize);
		}
	}

	componentDidMount() {
		this.loadFromServer(this.state.pageSize);
	}

	render() {
		return (
			<div>
				<CreateDialog attributes={this.state.attributes} onCreate={this.onCreate}/>
				<ShiftList shifts={this.state.shifts}
							  links={this.state.links}
							  pageSize={this.state.pageSize}
							  attributes={this.state.attributes}
							  onNavigate={this.onNavigate}
							  onUpdate={this.onUpdate}
							  onDelete={this.onDelete}
							  updatePageSize={this.updatePageSize}/>
			</div>
		)
	}
}

class CreateDialog extends React.Component {

	constructor(props) {
		super(props);
		this.handleSubmit = this.handleSubmit.bind(this);
	}

	handleSubmit(e) {
		e.preventDefault();
		var newShift = {};
		this.props.attributes.forEach(attribute => {
			newShift[attribute] = ReactDOM.findDOMNode(this.refs[attribute]).value.trim();
		});
		this.props.onCreate(newShift);

		// clear out the dialog's inputs
		this.props.attributes.forEach(attribute => {
			ReactDOM.findDOMNode(this.refs[attribute]).value = '';
		});

		// Navigate away from the dialog to hide it.
		window.location = "#";
	}

	render() {
		var inputs = this.props.attributes.map(attribute =>
			<p key={attribute}>
				<input type="text" placeholder={attribute} ref={attribute} className="field" />
			</p>
		);

		return (
			<div>
				<a href="#createShift">Create</a>

				<div id="createShift" className="modalDialog">
					<div>
						<a href="#" title="Close" className="close">X</a>

						<h2>Create new shift</h2>

						<form>
							{inputs}
							<button onClick={this.handleSubmit}>Create</button>
						</form>
					</div>
				</div>
			</div>
		)
	}

};

class UpdateDialog extends React.Component {

	constructor(props) {
		super(props);
		this.handleSubmit = this.handleSubmit.bind(this);
	}

	handleSubmit(e) {
		e.preventDefault();
		var updatedShift = {};
		this.props.attributes.forEach(attribute => {
			updatedShift[attribute] = ReactDOM.findDOMNode(this.refs[attribute]).value.trim();
		});
		this.props.onUpdate(this.props.shift, updatedShift);
		window.location = "#";
	}

	render() {
		var inputs = this.props.attributes.map(attribute =>
				<p key={this.props.shift.entity[attribute]}>
					<input type="text" placeholder={attribute}
						   defaultValue={this.props.shift.entity[attribute]}
						   ref={attribute} className="field" />
				</p>
		);

		var dialogId = "updateShift-" + this.props.shift.entity._links.self.href;

		return (
			<div key={this.props.shift.entity._links.self.href}>
				<a href={"#" + dialogId}>Update</a>
				<div id={dialogId} className="modalDialog">
					<div>
						<a href="#" title="Close" className="close">X</a>

						<h2>Update a shift</h2>

						<form>
							{inputs}
							<button onClick={this.handleSubmit}>Update</button>
						</form>
					</div>
				</div>
			</div>
		)
	}

};

class ShiftList extends React.Component{
	
	
	constructor(props) {
		super(props);
		this.handleNavFirst = this.handleNavFirst.bind(this);
		this.handleNavPrev = this.handleNavPrev.bind(this);
		this.handleNavNext = this.handleNavNext.bind(this);
		this.handleNavLast = this.handleNavLast.bind(this);
		this.handleInput = this.handleInput.bind(this);
	}
	
	
	handleInput(e) {
		e.preventDefault();
		var pageSize = ReactDOM.findDOMNode(this.refs.pageSize).value;
		if (/^[0-9]+$/.test(pageSize)) {
			this.props.updatePageSize(pageSize);
		} else {
			ReactDOM.findDOMNode(this.refs.pageSize).value =
				pageSize.substring(0, pageSize.length - 1);
		}
	}
	
	handleNavFirst(e){
		e.preventDefault();
		this.props.onNavigate(this.props.links.first.href);
	}

	handleNavPrev(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.prev.href);
	}

	handleNavNext(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.next.href);
	}

	handleNavLast(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.last.href);
	}
	
	render() {
		var shifts = this.props.shifts.map(shift =>
		<Shift key={shift.entity._links.self.href}
				  shift={shift}
				  attributes={this.props.attributes}
				  onUpdate={this.props.onUpdate}
				  onDelete={this.props.onDelete}/>
);
		
		var navLinks = [];
		if ("first" in this.props.links) {
			navLinks.push(<button key="first" onClick={this.handleNavFirst}>&lt;&lt;</button>);
		}
		if ("prev" in this.props.links) {
			navLinks.push(<button key="prev" onClick={this.handleNavPrev}>&lt;</button>);
		}
		if ("next" in this.props.links) {
			navLinks.push(<button key="next" onClick={this.handleNavNext}>&gt;</button>);
		}
		if ("last" in this.props.links) {
			navLinks.push(<button key="last" onClick={this.handleNavLast}>&gt;&gt;</button>);
		}
		
		return (
				<div>
					<input ref="pageSize" defaultValue={this.props.pageSize} onInput={this.handleInput}/>
					<table>
						<tbody>
							<tr>
								<th>Date</th>
								<th>Shift Type</th>
								<th></th>
								<th></th>
							</tr>
							{shifts}
						</tbody>
					</table>
					<div>
						{navLinks}
					</div>
				</div>
			)
		}
}

class Shift extends React.Component{

	constructor(props) {
		super(props);
		this.handleDelete = this.handleDelete.bind(this);
	}

	handleDelete() {
		this.props.onDelete(this.props.shift);
	}

	render() {
		return (
			<tr>
				<td>{this.props.shift.entity.date}</td>
				<td>{this.props.shift.entity.shiftType}</td>
				<td>
				<UpdateDialog shift={this.props.shift}
							  attributes={this.props.attributes}
							  onUpdate={this.props.onUpdate}/>
				</td>
				<td>
					<button onClick={this.handleDelete}>Delete</button>
				</td>
			</tr>
	)
}
}

ReactDOM.render(
		<App />,
		document.getElementById('react')
	)