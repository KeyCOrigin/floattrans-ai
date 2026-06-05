// AudioDevice.value-object.ts — 音频输入设备值对象

export interface AudioDevice {
  readonly deviceId: string;
  readonly label: string;
  readonly groupId: string;
}
