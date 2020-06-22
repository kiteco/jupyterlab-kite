import { IRootPosition } from '../../../positioning';
import { VirtualDocument } from '../../../virtual/document';
import { CodeMirrorLSPFeature } from '../feature';

export class Selection extends CodeMirrorLSPFeature {
  name = 'Selection';

  register(): void {
    this.wrapper_handlers.set('mousedown', this.onMousedown);
    super.register();
  }

  remove(): void {
    delete this.onMousedown;
    super.remove();
  }

  protected onMousedown = async () => {
    if (!this.virtual_editor?.virtual_document?.document_info) {
      return;
    }
    let root_position: IRootPosition;

    try {
      root_position = this.virtual_editor
        .getDoc()
        .getCursor('start') as IRootPosition;
    } catch (err) {
      console.warn('[Kite]: no root position available');
      return;
    }

    let document: VirtualDocument;
    try {
      document = this.virtual_editor.document_at_root_position(root_position);
    } catch (e) {
      console.warn(
        '[Kite]: Could not obtain virtual document from position',
        root_position
      );
      return;
    }
    if (document !== this.virtual_document) {
      return;
    }
    let virtual_position = this.virtual_editor.root_position_to_virtual_position(
      root_position
    );
    console.log('[Kite] Virtual Position', virtual_position);
    this.connection.sendSelection(
      virtual_position,
      this.virtual_document.document_info,
      this.virtual_document.value
    );
  };
}
